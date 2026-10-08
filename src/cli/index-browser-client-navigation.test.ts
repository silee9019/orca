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
function args() {
  return [
    'browser',
    'client-navigate',
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
    '--url',
    'https://after.test/',
    '--json'
  ]
}
it('passes the page environment as identity without selecting it as the viewer runtime', async () => {
  await main(args(), tmpdir())
  expect(process.exitCode).toBeUndefined()
  expect(fixture.constructor).toHaveBeenCalledWith(undefined, undefined)
  expect(fixture.environments).not.toHaveBeenCalled()
  expect(fixture.call).toHaveBeenCalledWith('ui.browserViewer', {
    viewer: 'host',
    operation: 'client-navigation',
    target,
    url: 'https://after.test/'
  })
})
it('keeps explicit viewer runtime selection independent of the page environment identity', async () => {
  pairRuntimeEnvironment(fixture.environments, 'viewer-runtime')
  await main([...args(), '--environment', 'viewer-runtime'], tmpdir())
  expect(process.exitCode).toBeUndefined()
  expect(fixture.constructor).toHaveBeenCalledWith(undefined, 'viewer-runtime')
  expect(fixture.call).toHaveBeenCalledWith('ui.browserViewer', {
    viewer: 'host',
    operation: 'client-navigation',
    target,
    url: 'https://after.test/'
  })
})
it('preserves ambient viewer selection without replacing the page environment identity', async () => {
  vi.stubEnv('ORCA_ENVIRONMENT', 'viewer-runtime')
  await main(args(), tmpdir())
  expect(process.exitCode).toBeUndefined()
  expect(fixture.constructor).toHaveBeenCalledWith(undefined, undefined)
  expect(fixture.call).toHaveBeenCalledWith('ui.browserViewer', {
    viewer: 'host',
    operation: 'client-navigation',
    target,
    url: 'https://after.test/'
  })
})
