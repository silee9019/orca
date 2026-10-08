import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Socket } from 'node:net'
import { expect, vi } from 'vitest'
import type { SkillDiscoveryResult } from '../../src/shared/skills'
import { Store } from '../../src/main/persistence'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { BROWSER_VIEWER_METHODS } from '../../src/main/runtime/rpc/methods/browser-viewer'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { BROWSER_FEATURE_WALL_SPECS } from '../../src/cli/specs/browser-feature-wall'
import { BROWSER_FEATURE_WALL_HANDLERS } from '../../src/cli/handlers/browser-feature-wall'
import { applyBrowserViewerRequest } from '../../src/renderer/src/runtime/browser-viewer-bridge'
import { BrowserUseSkillSetupCard } from '../../src/renderer/src/components/feature-wall/BrowserUseSkillSetupCard'
import {
  useInstalledAgentSkill,
  GLOBAL_AGENT_SKILL_SOURCE_KINDS,
  _installedAgentSkillDiscoveryInternalsForTests
} from '../../src/renderer/src/hooks/useInstalledAgentSkills'
import { useAppStore } from '../../src/renderer/src/store'

export async function browserFeatureWallOwnerSocketFixture() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const directory = mkdtempSync(join(tmpdir(), 'orca-feature-wall-'))
  const store = new Store({
    serializedState: JSON.stringify({ repos: [], settings: {} }),
    dataFile: join(directory, 'profile.json')
  })
  const runtime = new OrcaRuntimeService(store)
  const discovery: SkillDiscoveryResult = { skills: [], sources: [], scannedAt: 1 }
  const discover = vi.fn(async () => ({ ...discovery, skills: [...discovery.skills] }))
  const recordInteraction = vi.fn(async (id: Parameters<Store['recordFeatureInteraction']>[0]) =>
    store.recordFeatureInteraction(id)
  )
  Object.assign(window, {
    api: { skills: { discover }, ui: { recordFeatureInteraction: recordInteraction } }
  })
  useAppStore.setState({
    settings: store.getSettings(),
    persistedUIReady: true,
    activeView: 'settings',
    activeModal: 'feature-wall',
    featureInteractions: {},
    activeWorktreeId: null,
    activeRepoId: null,
    projects: [],
    repos: [],
    runtimeEnvironments: [],
    runtimeEnvironmentCatalogSettled: true
  })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  function SetupCard() {
    const skill = useInstalledAgentSkill('orca-cli', {
      sourceKinds: GLOBAL_AGENT_SKILL_SOURCE_KINDS
    })
    return createElement(BrowserUseSkillSetupCard, { skill })
  }
  const renderOwner = async (copies = 1): Promise<void> => {
    await act(async () =>
      root.render(
        createElement(
          'div',
          {},
          Array.from({ length: copies }, (_, key) => createElement(SetupCard, { key }))
        )
      )
    )
  }
  await renderOwner()
  runtime.setNotifier({
    browserViewer: async (command) => ({
      ...(await applyBrowserViewerRequest({
        id: 'reset-fixture',
        expiresAt: Date.now() + 3000,
        command
      })),
      viewerId: 9
    })
  })
  const dispatcher = new RpcDispatcher({ runtime, methods: BROWSER_VIEWER_METHODS })
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
  const client = new RuntimeClient(directory, 5000, null, null)
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  const invoke = async (action: string, workspace = 'none'): Promise<void> => {
    const specs = BROWSER_FEATURE_WALL_SPECS
    const parsed = parseArgs(
      [
        'browser',
        'feature-wall',
        '--viewer',
        'host',
        '--action',
        action,
        '--runtime',
        'local',
        '--workspace',
        workspace
      ],
      specs.map((spec) => spec.path),
      specs
    )
    validateCommandAndFlags(specs, parsed)
    const pending = BROWSER_FEATURE_WALL_HANDLERS['browser feature-wall']({
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
    await vi.waitFor(async () => {
      await act(async () => {})
      expect(settled).toBe(true)
    })
    await pending
  }
  return {
    discovery,
    discover,
    recordInteraction,
    store,
    container,
    output,
    invoke,
    renderOwner,
    close: async () => {
      await act(async () => root.unmount())
      container.remove()
      for (const socket of sockets) {
        socket.destroy()
      }
      await new Promise<void>((resolve) => server.close(() => resolve()))
      _installedAgentSkillDiscoveryInternalsForTests.reset()
      vi.restoreAllMocks()
      rmSync(directory, { recursive: true, force: true })
    }
  }
}
