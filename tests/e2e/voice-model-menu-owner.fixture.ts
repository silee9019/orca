import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Socket } from 'node:net'
import { expect, vi } from 'vitest'
import { Store } from '../../src/main/persistence'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { VOICE_VIEWER_METHODS } from '../../src/main/runtime/rpc/methods/voice-viewer'
import { VOICE_VIEWER_COMMAND_SPECS } from '../../src/cli/specs/voice-viewer'
import { VOICE_VIEWER_HANDLERS } from '../../src/cli/handlers/voice-viewer'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { applyVoiceViewerRequest } from '../../src/renderer/src/runtime/voice-viewer-bridge'
import { VoiceSpeechModelSection } from '../../src/renderer/src/components/settings/VoiceSpeechModelSection'
import { useAppStore } from '../../src/renderer/src/store'
import { getDefaultVoiceSettings } from '../../src/shared/constants'

export async function voiceModelMenuOwnerFixture() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const directory = mkdtempSync(join(tmpdir(), 'orca-voice-model-menu-'))
  const store = new Store({
    dataFile: join(directory, 'profile.json'),
    serializedState: JSON.stringify({ repos: [], settings: {} })
  })
  const runtime = new OrcaRuntimeService(store)
  useAppStore.setState({
    settings: { ...store.getSettings(), voice: { ...getDefaultVoiceSettings(), enabled: true } },
    persistedUIReady: true,
    activeModal: 'none',
    activeView: 'settings'
  })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const refresh = vi.fn(async () => {})
  const Owner = ({ copies }: { copies: number }) => {
    const voice = useAppStore((state) => state.settings?.voice ?? getDefaultVoiceSettings())
    return createElement(
      'section',
      { 'data-voice-settings-pane': '' },
      Array.from({ length: copies }, (_, key) =>
        createElement(VoiceSpeechModelSection, {
          key,
          voiceSettings: voice,
          catalog: [],
          modelStates: [],
          onUpdateVoiceSettings: () => {},
          onOpenOpenAiDialog: () => {},
          onRefreshModelStates: refresh
        })
      )
    )
  }
  const render = async (copies = 1): Promise<void> => {
    await act(async () => root.render(createElement(Owner, { copies })))
  }
  await render()
  runtime.setNotifier({
    voiceViewer: async (command) => {
      const pending = {
        value: Promise.resolve<Awaited<ReturnType<typeof applyVoiceViewerRequest>> | undefined>(
          undefined
        )
      }
      await act(async () => {
        pending.value = applyVoiceViewerRequest({
          id: 'menu-fixture',
          expiresAt: Date.now() + 2000,
          command
        })
        void pending.value.catch(() => {})
        await Promise.resolve()
      })
      const result = await pending.value
      if (!result) {
        throw new Error('fixture bridge did not reply')
      }
      return { ...result, viewerId: 9 }
    }
  })
  const dispatcher = new RpcDispatcher({ runtime, methods: VOICE_VIEWER_METHODS })
  const sockets = new Set<Socket>()
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
    let input = ''
    socket.on('data', (chunk) => {
      input += chunk.toString()
      const boundary = input.indexOf('\n')
      if (boundary === -1) {
        return
      }
      const request = JSON.parse(input.slice(0, boundary))
      input = input.slice(boundary + 1)
      if (request.authToken !== 'fixture-token') {
        socket.destroy()
        return
      }
      void dispatcher
        .dispatch(request)
        .then((response) => socket.write(`${JSON.stringify(response)}\n`))
    })
  })
  const endpoint = join(directory, 'runtime.sock')
  await new Promise<void>((resolve) => server.listen(endpoint, resolve))
  writeFileSync(
    join(directory, 'orca-runtime.json'),
    JSON.stringify({
      runtimeId: runtime.getRuntimeId(),
      pid: process.pid,
      transports: [{ kind: 'unix', endpoint }],
      authToken: 'fixture-token',
      startedAt: 1
    })
  )
  const client = new RuntimeClient(directory, 4000, null, null)
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  const invoke = async (operation: string): Promise<void> => {
    const specs = VOICE_VIEWER_COMMAND_SPECS
    const parsed = parseArgs(
      ['speech', 'viewer', '--viewer', 'host', '--operation', operation],
      specs.map((spec) => spec.path),
      specs
    )
    validateCommandAndFlags(specs, parsed)
    const pending = VOICE_VIEWER_HANDLERS['speech viewer']({
      client,
      flags: parsed.flags,
      cwd: directory,
      json: true
    })
    let settled = false
    void pending.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      }
    )
    await vi.waitFor(
      async () => {
        await act(async () => {})
        expect(settled).toBe(true)
      },
      { timeout: 3500 }
    )
    await pending
  }
  return {
    invoke,
    render,
    refresh,
    output,
    close: async () => {
      await act(async () => root.unmount())
      container.remove()
      for (const socket of sockets) {
        socket.destroy()
      }
      await new Promise<void>((resolve) => server.close(() => resolve()))
      vi.restoreAllMocks()
      rmSync(directory, { recursive: true, force: true })
    }
  }
}
