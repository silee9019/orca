import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../../src/cli/dispatch'
import type * as GhosttyDiscovery from '../../src/main/ghostty/discovery'
import type * as WarpDiscovery from '../../src/main/warp-themes/discovery'

const fixture = vi.hoisted(() => ({
  configPaths: new Array<string>(),
  warpDirectories: new Array<string>(),
  dialog: vi.fn()
}))
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  dialog: { showOpenDialog: fixture.dialog },
  BrowserWindow: { fromWebContents: vi.fn() }
}))
vi.mock('../../src/main/telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../../src/main/ssh/ssh-config-parser', () => ({
  loadUserSshConfig: () => ({ hosts: [] }),
  sshConfigHostsToTargets: () => []
}))
vi.mock('../../src/main/ghostty/discovery', async (original) => ({
  ...(await original<typeof GhosttyDiscovery>()),
  findGhosttyConfigPaths: async () => fixture.configPaths
}))
vi.mock('../../src/main/warp-themes/discovery', async (original) => ({
  ...(await original<typeof WarpDiscovery>()),
  getWarpThemeDirectories: () => fixture.warpDirectories
}))
vi.mock('../../src/main/warp-themes/parser-runner', async () => {
  const { parseWarpThemeYaml } = await import('../../src/main/warp-themes/parser')
  return {
    parseWarpThemeYamlWithTimeout: async (...args: Parameters<typeof parseWarpThemeYaml>) =>
      parseWarpThemeYaml(...args)
  }
})
import * as appEnvironment from '../../src/shared/app-environment'
import { Store } from '../../src/main/persistence'
import { ProfileStateSqliteAuthority } from '../../src/main/persistence/profile-state/profile-state-sqlite-authority'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { WORKSPACE_IMPORT_PREVIEW_HANDLERS } from '../../src/cli/handlers/workspace-import-previews'
import {
  WORKSPACE_IMPORT_PREVIEW_METHODS,
  setDesktopImportPreviewsForRpc
} from '../../src/main/runtime/rpc/methods/workspace-import-previews'
import { registerSettingsImportPreviewHandlers } from '../../src/main/settings-import-previews'

let directory: string
let store: Store
let authority: ProfileStateSqliteAuthority
let ctx: HandlerContext
let runtime: OrcaRuntimeService
function lastResult() {
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-import-preview-cli-'))
  vi.spyOn(appEnvironment, 'getAppEnvironment').mockReturnValue({
    getPath: () => directory,
    getAppPath: () => directory,
    getVersion: () => 'fixture',
    isPackaged: () => false,
    onWillQuit: () => {},
    exit: () => {},
    getAppMetrics: () => []
  })
  authority = new ProfileStateSqliteAuthority(join(directory, 'profile.db'), 'fixture')
  vi.spyOn(authority, 'scheduleBackup').mockImplementation(() => {})
  store = new Store({ dataFile: join(directory, 'data.json'), profileStateAuthority: authority })
  fixture.configPaths = []
  fixture.warpDirectories = []
  fixture.dialog.mockReset()
  fixture.dialog.mockRejectedValue(new Error('Unexpected native dialog'))
  runtime = new OrcaRuntimeService(store)
  registerSettingsImportPreviewHandlers(store)
  const dispatcher = new RpcDispatcher({
    runtime,
    methods: WORKSPACE_IMPORT_PREVIEW_METHODS
  })
  const client = new RuntimeClient('different-client-profile')
  vi.spyOn(client, 'call').mockImplementation(async (method, params) => {
    const response = await dispatcher.dispatch({
      id: 'fixture',
      authToken: 'fixture',
      method,
      params
    })
    if (!response.ok) {
      throw new RuntimeClientError(response.error.code, response.error.message)
    }
    return response
  })
  ctx = { client, cwd: directory, json: true, flags: new Map() }
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(async () => {
  setDesktopImportPreviewsForRpc(null)
  await store.freezeWritesAsync()
  authority.close()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

it('reads an isolated Ghostty config through the actual parser without changing settings or source bytes', async () => {
  const file = join(directory, 'ghostty-config')
  const text = 'font-size = 18\ncommand = private-command-canary\n'
  await writeFile(file, text)
  fixture.configPaths = [file]
  const before = JSON.stringify(store.getSettings())
  const update = vi.spyOn(store, 'updateSettings')
  await WORKSPACE_IMPORT_PREVIEW_HANDLERS['settings preview-ghostty-import'](ctx)
  expect(lastResult()).toMatchObject({
    found: true,
    configPath: file,
    diff: { terminalFontSize: 18 }
  })
  expect(lastResult().unsupportedKeys).toContain('command')
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('private-command-canary')
  expect(JSON.stringify(store.getSettings())).toBe(before)
  expect(update).not.toHaveBeenCalled()
  expect(await readFile(file, 'utf8')).toBe(text)
  expect(fixture.dialog).not.toHaveBeenCalled()
})

it('reads local Warp theme files through the actual YAML parser with a fixture parser worker', async () => {
  const folder = join(directory, 'warp-themes')
  await mkdir(folder)
  const file = join(folder, 'fixture.yaml')
  const text =
    "name: Fixture\nbackground: '#111111'\nforeground: '#eeeeee'\nterminal_colors:\n  normal:\n    black: '#000000'\n"
  await writeFile(file, text)
  fixture.warpDirectories = [folder]
  const before = JSON.stringify(store.getSettings())
  const update = vi.spyOn(store, 'updateSettings')
  await WORKSPACE_IMPORT_PREVIEW_HANDLERS['settings preview-warp-auto'](ctx)
  expect(lastResult()).toMatchObject({
    found: true,
    themes: [expect.objectContaining({ name: 'Fixture', source: 'warp' })]
  })
  expect(lastResult().themes[0].selectionValue).toMatch(/^custom:/)
  expect(JSON.stringify(store.getSettings())).toBe(before)
  expect(update).not.toHaveBeenCalled()
  expect(await readFile(file, 'utf8')).toBe(text)
  expect(fixture.dialog).not.toHaveBeenCalled()
})

it('preserves empty previews and does not open a native picker', async () => {
  for (const command of ['settings preview-ghostty-import', 'settings preview-warp-auto']) {
    await WORKSPACE_IMPORT_PREVIEW_HANDLERS[command](ctx)
    expect(lastResult().found).toBe(false)
  }
  expect(fixture.dialog).not.toHaveBeenCalled()
})

it('fails on missing services and old peers without scanning the client profile', async () => {
  setDesktopImportPreviewsForRpc(null)
  for (const command of ['settings preview-ghostty-import', 'settings preview-warp-auto']) {
    await expect(WORKSPACE_IMPORT_PREVIEW_HANDLERS[command](ctx)).rejects.toMatchObject({
      code: 'runtime_unavailable'
    })
  }
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(
    WORKSPACE_IMPORT_PREVIEW_HANDLERS['settings preview-warp-auto'](ctx)
  ).rejects.toMatchObject({ code: 'method_not_found' })
  expect(console.log).not.toHaveBeenCalled()
  expect(fixture.dialog).not.toHaveBeenCalled()
})

it('rejects explicit preview failures without returning private error details', async () => {
  setDesktopImportPreviewsForRpc({
    ghostty: async () => ({
      found: false,
      diff: {},
      unsupportedKeys: [],
      error: 'private-preview-canary'
    }),
    warpAuto: async () => {
      throw new Error('private-preview-canary')
    }
  })
  for (const command of ['settings preview-ghostty-import', 'settings preview-warp-auto']) {
    await expect(WORKSPACE_IMPORT_PREVIEW_HANDLERS[command](ctx)).rejects.toMatchObject({
      code: 'runtime_error',
      message: expect.not.stringContaining('private-preview-canary')
    })
  }
  expect(console.log).not.toHaveBeenCalled()
  expect(fixture.dialog).not.toHaveBeenCalled()
})
