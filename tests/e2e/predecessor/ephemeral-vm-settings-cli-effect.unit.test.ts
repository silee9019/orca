// @vitest-environment happy-dom
import '../../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { afterEach, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { fireEvent } from '@testing-library/react'
import { createRoot } from 'react-dom/client'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Socket } from 'node:net'
import {
  createSqliteTestStore,
  readPersistedStateJson,
  closeTestStores
} from '../../../src/main/persistence-test-harness'
import { Store } from '../../../src/main/persistence'
import { applyDesktopSettingsUpdate } from '../../../src/main/ipc/desktop-settings-update'
import { RuntimeSettingsActions } from '../../../src/main/runtime/runtime-settings-actions'
import { OrcaRuntimeService } from '../../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../../src/main/runtime/rpc/dispatcher'
import { SETTINGS_CONTROL_METHODS } from '../../../src/main/runtime/rpc/methods/settings-control'
import { SETTINGS_COMMAND_SPECS } from '../../../src/cli/specs/settings'
import { SETTINGS_HANDLERS } from '../../../src/cli/handlers/settings'
import { parseArgs, validateCommandAndFlags } from '../../../src/cli/args'
import { RuntimeClient } from '../../../src/cli/runtime-client'
import { useAppStore } from '../../../src/renderer/src/store'
import { EphemeralVmsExperimentalSetting } from '../../../src/renderer/src/components/settings/EphemeralVmsExperimentalSetting'

const boundary = vi.hoisted(() => ({
  native: vi.fn(() => {
    throw new Error('Native effect refused')
  }),
  track: vi.fn()
}))
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => {
      throw new Error('Implicit home refused')
    }
  },
  nativeTheme: {}
}))
vi.mock('../../../src/main/menu/register-app-menu', () => ({ rebuildAppMenu: boundary.native }))
vi.mock('../../../src/main/telemetry/client', () => ({ track: boundary.track }))
vi.mock('../../../src/main/i18n/main-i18n', () => ({ setMainUiLanguage: boundary.native }))
vi.mock('../../../src/main/network/proxy-settings', () => ({
  applyElectronProxySettings: boundary.native
}))
vi.mock('../../../src/main/browser/browser-session-proxy', () => ({
  applyBrowserSessionProxies: boundary.native
}))
vi.mock('../../../src/main/app-icon', () => ({ applyAppIcon: boundary.native }))
vi.mock('../../../src/main/agent-hooks/managed-agent-hook-controls', () => ({
  applyAgentStatusHooksEnabled: boundary.native
}))
vi.mock('../../../src/main/agent-hooks/install-telemetry', () => ({
  recordManagedHookInstallFailure: boundary.native
}))
vi.mock('../../../src/main/ai-vault-search/session-search-enablement', () => ({
  applySessionSearchSettingsChange: boundary.native
}))
vi.mock('../../../src/main/worktree-root-preparation', () => ({
  prepareLocalWorktreeRootsForRepos: boundary.native
}))
vi.mock('../../../src/main/ipc/worktree-base-directory-watcher', () => ({
  scheduleCurrentWorktreeBaseDirectoryWatcherSync: boundary.native
}))
vi.mock('../../../src/renderer/src/hooks/useActiveProjectSkillRuntime', () => ({
  useActiveProjectSkillRuntime: () => ({
    installDisabledReason: null,
    canUseLocalSkillFreshness: false
  })
}))
vi.mock('../../../src/renderer/src/hooks/useInstalledAgentSkills', () => ({
  GLOBAL_AGENT_SKILL_SOURCE_KINDS: [],
  useInstalledAgentSkill: () => ({
    installed: false,
    loading: false,
    error: null,
    refresh: async () => false
  })
}))
vi.mock('../../../src/renderer/src/components/settings/AgentSkillSetupPanel', () => ({
  AgentSkillSetupPanel: () => null
}))
afterEach(() => vi.restoreAllMocks())

it('compares the original VM toggle and predecessor desktop writer through the socket and mounted owner', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const directory = mkdtempSync(join(tmpdir(), 'orca-vm-toggle-'))
  const dataFile = join(directory, 'profile.json')
  writeFileSync(
    dataFile,
    JSON.stringify({ repos: [], settings: { experimentalEphemeralVms: false } })
  )
  const store = createSqliteTestStore(Store, { dataFile })
  const apply = vi.fn((updates: Parameters<typeof applyDesktopSettingsUpdate>[1]) =>
    applyDesktopSettingsUpdate(store, updates)
  )
  const actions = new RuntimeSettingsActions({
    getSettings: () => store.getSettings(),
    applySettings: apply,
    getKeybindings: () => null,
    onKeybindingsChanged: () => {},
    listFonts: async () => []
  })
  const runtime = new OrcaRuntimeService(store, undefined, { settingsActions: actions })
  const methods = SETTINGS_CONTROL_METHODS.filter(
    (method) => method.name === 'settings.desktop.update'
  )
  expect(methods).toHaveLength(1)
  const dispatcher = new RpcDispatcher({ runtime, methods })
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
  const client = new RuntimeClient(directory, 3000, null, null)
  const catalog = vi.fn(async () => [])
  Object.assign(window, {
    api: {
      settings: { set: apply },
      ephemeralVm: { listRecipeCatalog: catalog },
      ui: { set: async () => {} }
    }
  })
  useAppStore.setState({
    settings: store.getSettings(),
    activeView: 'settings',
    activeModal: 'none',
    persistedUIReady: true
  })
  const unsubscribe = store.onSettingsChanged((_updates, settings) =>
    useAppStore.setState({ settings })
  )
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  function Owner() {
    const settings = useAppStore((state) => state.settings)
    const updateSettings = useAppStore((state) => state.updateSettings)
    return settings
      ? createElement(EphemeralVmsExperimentalSetting, { settings, updateSettings })
      : null
  }
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  const invoke = async (value: unknown) => {
    const file = join(directory, 'updates.json')
    writeFileSync(file, JSON.stringify({ experimentalEphemeralVms: value }))
    const specs = SETTINGS_COMMAND_SPECS
    const parsed = parseArgs(
      ['settings', 'desktop', 'update', '--file', file],
      specs.map((spec) => spec.path),
      specs
    )
    validateCommandAndFlags(specs, parsed)
    await act(async () =>
      SETTINGS_HANDLERS['settings desktop update']({
        client,
        flags: parsed.flags,
        cwd: directory,
        json: true
      })
    )
  }
  try {
    await act(async () => root.render(createElement(Owner)))
    expect(container.querySelector('[data-settings-section="ephemeral-vms"]')).toBeNull()
    const toggle = container.querySelector('[role="switch"]')
    if (!toggle) {
      throw new Error('VM toggle missing')
    }
    await act(async () => fireEvent.click(toggle))
    expect(apply).toHaveBeenLastCalledWith({ experimentalEphemeralVms: true })
    expect(store.getSettings().experimentalEphemeralVms).toBe(true)
    expect(container.querySelector('[data-settings-section="ephemeral-vms"]')).not.toBeNull()
    await invoke(false)
    expect(store.getSettings().experimentalEphemeralVms).toBe(false)
    store.flushOrThrow()
    expect(JSON.parse(readPersistedStateJson(dataFile)).settings.experimentalEphemeralVms).toBe(
      false
    )
    expect(container.querySelector('[data-settings-section="ephemeral-vms"]')).toBeNull()
    expect(JSON.parse(String(log.mock.calls.at(-1)?.[0])).result).toMatchObject({
      persisted: true,
      rendered: false,
      settings: { experimentalEphemeralVms: false }
    })
    await invoke(true)
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(container.querySelector('[data-settings-section="ephemeral-vms"]')).not.toBeNull()
    const calls = apply.mock.calls.length
    await expect(invoke('true')).rejects.toMatchObject({ code: 'invalid_argument' })
    expect(apply).toHaveBeenCalledTimes(calls)
    expect(store.getSettings().experimentalEphemeralVms).toBe(true)
    store.flushOrThrow()
    expect(JSON.parse(readPersistedStateJson(dataFile)).settings.experimentalEphemeralVms).toBe(
      true
    )
    expect(boundary.native).not.toHaveBeenCalled()
    expect(catalog).toHaveBeenCalledTimes(2)
  } finally {
    await act(async () => root.unmount())
    unsubscribe()
    container.remove()
    for (const socket of sockets) {
      socket.destroy()
    }
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await closeTestStores()
    rmSync(directory, { recursive: true, force: true })
  }
})
