import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({
  call: vi.fn(),
  constructor: vi.fn(),
  serve: vi.fn(),
  userData: vi.fn(),
  environments: vi.fn()
}))
vi.mock('./runtime-client', async () => {
  const { createRuntimeClientModuleMock } = await import('./index-test-harness.js')
  return createRuntimeClientModuleMock({
    callMock: fixture.call,
    runtimeClientConstructorMock: fixture.constructor,
    serveOrcaAppMock: fixture.serve,
    getDefaultUserDataPathMock: fixture.userData
  })
})
vi.mock('./runtime/environments', () => ({ listEnvironments: fixture.environments }))
import { main } from './index'
import { pairRuntimeEnvironment } from './index-test-harness'
const target = {
  worktreeId: 'folder:fixture',
  page: 'page',
  environmentId: 'page-environment',
  remotePageId: 'remote',
  browserHostClientId: 'desktop',
  browserHostGeneration: 3,
  pageHostGeneration: 4
}
const originalExitCode = process.exitCode
beforeEach(() => {
  vi.unstubAllEnvs()
  vi.stubEnv('ORCA_ENVIRONMENT', '')
  vi.stubEnv('ORCA_PAIRING_CODE', '')
  vi.stubEnv('ORCA_REMOTE_PAIRING', '')
  fixture.call.mockReset().mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'viewer-runtime' },
    result: {
      applied: true,
      clientReload: { target, accepted: true, loading: true, completionObserved: false },
      clientFind: {
        target,
        state: { open: true, query: 'needle', activeMatch: 0, totalMatches: 0 }
      },
      clientAddress: {
        target,
        state: {
          value: 'https://draft.test/',
          open: true,
          focused: true,
          selectedIndex: -1,
          suggestions: []
        }
      },
      clientSubmission: {
        ...target,
        url: 'https://after.test/',
        metadataRevision: 7,
        loading: false,
        accepted: true
      },
      clientNavigation: {
        ...target,
        url: 'https://after.test/',
        metadataRevision: 7,
        loading: false,
        accepted: true
      }
    }
  })
  fixture.constructor.mockClear()
  fixture.environments.mockClear()
  fixture.userData.mockReturnValue(join(tmpdir(), 'client-navigate-index'))
  pairRuntimeEnvironment(fixture.environments, target.environmentId)
  process.exitCode = undefined
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  process.exitCode = originalExitCode
})
function args(
  command: 'client-navigate' | 'client-address' | 'client-find' | 'client-reload' | 'client-submit'
) {
  return [
    'browser',
    command,
    '--viewer',
    'host',
    '--worktree',
    target.worktreeId,
    '--page',
    target.page,
    '--runtime-environment',
    target.environmentId,
    '--remote-page',
    target.remotePageId,
    '--browser-client',
    target.browserHostClientId,
    '--browser-host-generation',
    '3',
    '--page-host-generation',
    '4',
    ...(command === 'client-navigate'
      ? ['--url', 'https://after.test/']
      : command === 'client-submit'
        ? ['--value', 'orca cli search']
        : command === 'client-find'
          ? ['--action', 'query', '--query', 'needle']
          : command === 'client-reload'
            ? []
            : ['--action', 'draft', '--text', 'https://draft.test/']),
    '--json'
  ]
}
it.each([
  'client-navigate',
  'client-address',
  'client-find',
  'client-reload',
  'client-submit'
] as const)(
  'passes the page environment as identity without selecting it as the viewer runtime',
  async (command) => {
    await main(args(command), tmpdir())
    expect(process.exitCode).toBeUndefined()
    expect(fixture.constructor).toHaveBeenCalledWith(undefined, undefined)
    expect(fixture.environments).not.toHaveBeenCalled()
    expect(fixture.call).toHaveBeenCalledWith('ui.browserViewer', {
      viewer: 'host',
      operation:
        command === 'client-submit'
          ? 'client-submission'
          : command === 'client-navigate'
            ? 'client-navigation'
            : command,
      target,
      ...(command === 'client-navigate'
        ? { url: 'https://after.test/' }
        : command === 'client-submit'
          ? { entry: 'address-bar', value: 'orca cli search' }
          : command === 'client-find'
            ? { action: 'query', query: 'needle' }
            : command === 'client-reload'
              ? { entry: 'context-menu' }
              : { command: { action: 'draft', text: 'https://draft.test/' } })
    })
  }
)
it.each([
  'client-navigate',
  'client-address',
  'client-find',
  'client-reload',
  'client-submit'
] as const)(
  'keeps explicit viewer runtime selection independent of the page environment identity',
  async (command) => {
    pairRuntimeEnvironment(fixture.environments, 'viewer-runtime')
    await main([...args(command), '--environment', 'viewer-runtime'], tmpdir())
    expect(process.exitCode).toBeUndefined()
    expect(fixture.constructor).toHaveBeenCalledWith(undefined, 'viewer-runtime')
    expect(fixture.call).toHaveBeenCalledWith('ui.browserViewer', {
      viewer: 'host',
      operation:
        command === 'client-submit'
          ? 'client-submission'
          : command === 'client-navigate'
            ? 'client-navigation'
            : command,
      target,
      ...(command === 'client-navigate'
        ? { url: 'https://after.test/' }
        : command === 'client-submit'
          ? { entry: 'address-bar', value: 'orca cli search' }
          : command === 'client-find'
            ? { action: 'query', query: 'needle' }
            : command === 'client-reload'
              ? { entry: 'context-menu' }
              : { command: { action: 'draft', text: 'https://draft.test/' } })
    })
  }
)
it.each([
  'client-navigate',
  'client-address',
  'client-find',
  'client-reload',
  'client-submit'
] as const)(
  'preserves ambient viewer selection without replacing the page environment identity',
  async (command) => {
    vi.stubEnv('ORCA_ENVIRONMENT', 'viewer-runtime')
    await main(args(command), tmpdir())
    expect(process.exitCode).toBeUndefined()
    expect(fixture.constructor).toHaveBeenCalledWith(undefined, undefined)
    expect(fixture.call).toHaveBeenCalledWith('ui.browserViewer', {
      viewer: 'host',
      operation:
        command === 'client-submit'
          ? 'client-submission'
          : command === 'client-navigate'
            ? 'client-navigation'
            : command,
      target,
      ...(command === 'client-navigate'
        ? { url: 'https://after.test/' }
        : command === 'client-submit'
          ? { entry: 'address-bar', value: 'orca cli search' }
          : command === 'client-find'
            ? { action: 'query', query: 'needle' }
            : command === 'client-reload'
              ? { entry: 'context-menu' }
              : { command: { action: 'draft', text: 'https://draft.test/' } })
    })
  }
)
