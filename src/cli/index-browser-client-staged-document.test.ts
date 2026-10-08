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
  remotePageId: 'remote'
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
      clientStagedDocument: {
        ...target,
        accepted: true,
        conversion: 'converted',
        documentWorktreeId: target.worktreeId,
        documentPageId: 'document',
        documentWorkspaceId: 'workspace',
        hostPlacementKnown: false,
        filePath: join(tmpdir(), 'fixture.html')
      }
    }
  })
  fixture.constructor.mockClear()
  fixture.environments.mockClear()
  fixture.userData.mockReturnValue(join(tmpdir(), 'client-staged-document-index'))
  pairRuntimeEnvironment(fixture.environments, target.environmentId)
  process.exitCode = undefined
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  process.exitCode = originalExitCode
})
it.each(['local', 'explicit', 'ambient'] as const)(
  'keeps staged page identity independent of %s viewer selection in actual index.main',
  async (selection) => {
    if (selection === 'explicit') {
      pairRuntimeEnvironment(fixture.environments, 'viewer-runtime')
    }
    if (selection === 'ambient') {
      vi.stubEnv('ORCA_ENVIRONMENT', 'viewer-runtime')
    }
    await main(
      [
        'browser',
        'client-staged-document',
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
        '--value',
        './fixture.html',
        '--json',
        ...(selection === 'explicit' ? ['--environment', 'viewer-runtime'] : [])
      ],
      tmpdir()
    )
    expect(process.exitCode).toBeUndefined()
    expect(fixture.constructor).toHaveBeenCalledWith(
      undefined,
      selection === 'explicit' ? 'viewer-runtime' : undefined
    )
    expect(fixture.call).toHaveBeenCalledWith('ui.browserViewer', {
      viewer: 'host',
      operation: 'client-staged-document',
      entry: 'address-bar-staged',
      target,
      value: './fixture.html'
    })
    if (selection === 'local') {
      expect(fixture.environments).not.toHaveBeenCalled()
    }
  }
)
