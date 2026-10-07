// @vitest-environment happy-dom
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { VoiceMicrophoneSetting } from '../../src/renderer/src/components/settings/VoiceMicrophoneSetting'
import { EphemeralVmsPane } from '../../src/renderer/src/components/settings/EphemeralVmsPane'
import {
  getEphemeralVmDesktopService,
  setEphemeralVmDesktopService
} from '../../src/main/ephemeral-vm-desktop-service'
import { initializeEphemeralVmOperations } from '../../src/main/ephemeral-vm-operations'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Socket } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { Store } from '../../src/main/persistence'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { VOICE_VIEWER_COMMAND_SPECS } from '../../src/cli/specs/voice-viewer'
import { VOICE_VIEWER_HANDLERS } from '../../src/cli/handlers/voice-viewer'
import { VOICE_VIEWER_METHODS } from '../../src/main/runtime/rpc/methods/voice-viewer'
import { applyVoiceViewerRequest } from '../../src/renderer/src/runtime/voice-viewer-bridge'
import type { VoiceSettings } from '../../src/shared/speech-types'
const viewerFixture = vi.hoisted(() => ({ getState: () => ({}) }))
vi.mock('@/store', () => ({
  useAppStore: Object.assign(
    (selector: (state: unknown) => unknown) => selector(viewerFixture.getState()),
    { getState: () => viewerFixture.getState() }
  )
}))
vi.mock('../../src/renderer/src/hooks/useActiveProjectSkillRuntime', () => ({
  useActiveProjectSkillRuntime: () => ({
    installDisabledReason: null,
    canUseLocalSkillFreshness: false
  })
}))
vi.mock('../../src/renderer/src/hooks/useInstalledAgentSkills', () => ({
  GLOBAL_AGENT_SKILL_SOURCE_KINDS: [],
  useInstalledAgentSkill: () => ({
    installed: false,
    loading: false,
    error: null,
    refresh: () => {}
  })
}))
vi.mock('../../src/renderer/src/components/settings/AgentSkillSetupPanel', () => ({
  AgentSkillSetupPanel: () => null
}))
vi.mock('../../src/cli/runtime/launch', () => ({
  launchOrcaApp: () => {
    throw new Error('Fixture refuses app launch')
  }
}))
const roots: string[] = []
afterEach(() => {
  setEphemeralVmDesktopService(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})
describe.skipIf(process.platform === 'win32')(
  'voice settings CLI actual owner socket effects',
  () => {
    it('runs microphone and VM pane commands through the socket and actual mounted UI owners', async () => {
      globalThis.IS_REACT_ACT_ENVIRONMENT = true
      const root = mkdtempSync(join(tmpdir(), 'orca-voice-owner-'))
      roots.push(root)
      const store = new Store({
        serializedState: JSON.stringify({
          repos: [{ id: 'owner-repo', path: root, displayName: 'Owner Repo', addedAt: 1 }],
          settings: {
            experimentalEphemeralVms: true,
            voice: { enabled: true, dictationMode: 'toggle' }
          }
        }),
        dataFile: join(root, 'profile.json')
      })
      initializeEphemeralVmOperations(store, root)
      const runtime = new OrcaRuntimeService(store)
      const container = document.createElement('div')
      document.body.append(container)
      const uiRoot = createRoot(container)
      let clipboard = ''
      let grant: ((stream: { getTracks: () => { stop: () => void }[] }) => void) | undefined
      const stop = vi.fn()
      const requestPermission = vi.fn()
      const recordFeatureInteraction = vi.fn()
      vi.stubGlobal('navigator', {
        userAgent: 'fixture',
        mediaDevices: {
          enumerateDevices: async () => [
            { kind: 'audioinput', deviceId: 'owner-mic', label: 'Owner Mic' }
          ],
          getUserMedia: () =>
            new Promise((resolve) => {
              grant = resolve
            })
        }
      })
      Object.assign(window, {
        api: {
          settings: { get: async () => store.getSettings() },
          developerPermissions: { request: requestPermission },
          ephemeralVm: {
            listRecipeCatalog: () => getEphemeralVmDesktopService().listRecipeCatalog()
          },
          ui: {
            writeClipboardText: async (text: string) => {
              clipboard = text
            },
            readClipboardText: async () => clipboard
          }
        }
      })
      function renderOwners() {
        uiRoot.render(
          createElement(
            'div',
            {},
            createElement(
              'section',
              { 'data-voice-settings-pane': '' },
              createElement(VoiceMicrophoneSetting, {
                voiceSettings: store.getSettings().voice,
                onUpdateVoiceSettings: (updates: Partial<VoiceSettings>) => {
                  store.updateSettings({ voice: { ...store.getSettings().voice, ...updates } })
                  renderOwners()
                }
              })
            ),
            createElement(EphemeralVmsPane)
          )
        )
      }
      viewerFixture.getState = () => ({
        activeModal: 'none',
        persistedUIReady: true,
        settings: store.getSettings(),
        openSettingsTarget: () => {},
        openSettingsPage: () => {},
        recordFeatureInteraction
      })
      await act(async () => renderOwners())
      runtime.setNotifier({
        voiceViewer: async (command) => ({
          ...(await applyVoiceViewerRequest({
            id: 'actual-owner',
            expiresAt: Date.now() + 3000,
            command
          })),
          viewerId: 8
        })
      })
      const dispatcher = new RpcDispatcher({ runtime, methods: VOICE_VIEWER_METHODS })
      const sockets = new Set<Socket>()
      const server = createServer((socket) => {
        sockets.add(socket)
        socket.once('close', () => sockets.delete(socket))
        let pending = ''
        socket.on('data', (chunk) => {
          pending += chunk.toString()
          const boundary = pending.indexOf('\n')
          if (boundary === -1) {
            return
          }
          const request = JSON.parse(pending.slice(0, boundary))
          pending = pending.slice(boundary + 1)
          if (request.authToken !== 'owner-token') {
            socket.destroy()
            return
          }
          void dispatcher
            .dispatch(request)
            .then((response) => socket.write(`${JSON.stringify(response)}\n`))
        })
      })
      const endpoint = join(root, 'runtime.sock')
      await new Promise<void>((resolve) => server.listen(endpoint, resolve))
      writeFileSync(
        join(root, 'orca-runtime.json'),
        JSON.stringify({
          runtimeId: runtime.getRuntimeId(),
          pid: process.pid,
          transports: [{ kind: 'unix', endpoint }],
          authToken: 'owner-token',
          startedAt: 1
        })
      )
      const client = new RuntimeClient(root, 5000, null, null)
      const output = vi.spyOn(console, 'log').mockImplementation(() => {})
      async function invoke(operation: string, flags: string[] = []) {
        const specs = VOICE_VIEWER_COMMAND_SPECS
        const parsed = parseArgs(
          ['speech', 'viewer', '--viewer', 'host', '--operation', operation, ...flags],
          specs.map((spec) => spec.path),
          specs
        )
        validateCommandAndFlags(specs, parsed)
        await VOICE_VIEWER_HANDLERS['speech viewer']({
          client,
          flags: parsed.flags,
          cwd: root,
          json: true
        })
      }
      try {
        await act(async () => {
          await invoke('microphones-list')
        })
        expect(output.mock.calls.at(-1)?.[0]).toContain('Owner Mic')
        expect(container.querySelector('[data-voice-microphone-devices="1"]')).not.toBeNull()
        await act(async () => {
          await invoke('microphone-select', ['--device', 'owner-mic'])
        })
        expect(store.getSettings().voice.microphoneDeviceId).toBe('owner-mic')
        expect(container.textContent).toContain('Owner Mic')
        await act(async () => {
          await invoke('microphone-request-start')
        })
        const request = z
          .object({ result: z.object({ operationId: z.string() }) })
          .parse(JSON.parse(String(output.mock.calls.at(-1)?.[0])))
        expect(
          container.querySelector('[data-voice-microphone-access-pending="true"]')
        ).not.toBeNull()
        await invoke('microphone-request-cancel', ['--operation-id', request.result.operationId])
        await expect(invoke('microphone-request-start')).rejects.toThrow('already_pending')
        await act(async () => {
          grant?.({ getTracks: () => [{ stop }] })
        })
        expect(stop).toHaveBeenCalledOnce()
        expect(requestPermission).not.toHaveBeenCalled()
        await invoke('microphone-request-status', ['--operation-id', request.result.operationId])
        expect(output.mock.calls.at(-1)?.[0]).toContain('"requestState": "cancelled"')
        expect(output.mock.calls.at(-1)?.[0]).toContain('"osPromptDismissed": false')
        expect(
          container.querySelector('[data-voice-microphone-access-pending="false"]')
        ).not.toBeNull()
        requestPermission.mockResolvedValue({
          id: 'microphone',
          status: 'denied',
          openedSystemSettings: false
        })
        vi.stubGlobal('navigator', {
          userAgent: 'fixture',
          mediaDevices: {
            enumerateDevices: async () => [],
            getUserMedia: async () => {
              throw Object.assign(new Error('Fixture denied'), { name: 'NotAllowedError' })
            }
          }
        })
        await act(async () => {
          await invoke('microphones-list')
        })
        await act(async () => {
          await invoke('microphone-request-start')
        })
        const denied = z
          .object({ result: z.object({ operationId: z.string() }) })
          .parse(JSON.parse(String(output.mock.calls.at(-1)?.[0])))
        await vi.waitFor(async () => {
          await act(async () => {})
          expect(container.querySelector('[role="alert"]')?.textContent).toContain('blocked')
        })
        expect(requestPermission).toHaveBeenCalledWith({ id: 'microphone' })
        await invoke('microphone-request-status', ['--operation-id', denied.result.operationId])
        expect(output.mock.calls.at(-1)?.[0]).toContain('"requestState": "denied"')
        writeFileSync(
          join(root, 'ORCA.yaml'),
          'version: 1\nenvironmentRecipes:\n  - id: owner-recipe\n    name: Owner Recipe\n    create: ./fixture-create\n'
        )
        await act(async () => {
          await invoke('vm-catalog-refresh')
        })
        expect(container.textContent).toContain('Owner Recipe')
        expect(container.querySelector('[data-vm-recipe-count="1"]')).not.toBeNull()
        const copied = invoke('vm-copy-prompt')
        await vi.waitFor(async () => {
          await act(async () => {})
          expect(container.querySelector('[data-vm-prompt-copied="true"]')).not.toBeNull()
        })
        await copied
        expect(recordFeatureInteraction).toHaveBeenCalledWith('ephemeral-vm-setup')
        expect(clipboard).not.toBe('')
        expect(container.querySelector('[data-vm-prompt-copied="true"]')).not.toBeNull()
        expect(output.mock.calls.at(-1)?.[0]).toContain('"applied": true')
      } finally {
        await act(async () => uiRoot.unmount())
        container.remove()
        for (const socket of sockets) {
          socket.destroy()
        }
        await new Promise<void>((resolve) => server.close(() => resolve()))
      }
    })
  }
)
