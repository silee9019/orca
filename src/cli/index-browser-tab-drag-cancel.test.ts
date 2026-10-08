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
  worktree: 'folder:fixture',
  workspace: 'browser',
  unifiedTab: 'tab',
  group: 'left',
  environmentId: 'page-environment'
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
      tabDragCancel: {
        target,
        cancelled: true,
        dragActive: false,
        hoverVisible: false,
        ownerPassthroughHeld: false,
        ownerMissedEndFallbackInstalled: false,
        passthroughActiveAfter: false,
        activeGroup: 'right',
        activeTabs: { right: 'tab' },
        nativePointerVerified: false
      }
    }
  })
  fixture.constructor.mockClear()
  fixture.environments.mockClear()
  fixture.userData.mockReturnValue(join(tmpdir(), 'tab-drop-index'))
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
  'keeps tab execution identity independent of %s viewer selection in actual index.main',
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
        'tab-drag',
        'cancel',
        '--viewer',
        'host',
        '--worktree',
        target.worktree,
        '--workspace',
        target.workspace,
        '--group',
        target.group,
        '--unified-tab',
        target.unifiedTab,
        '--runtime-environment',
        target.environmentId,
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
      operation: 'tab-drag-cancel',
      target
    })
    if (selection === 'local') {
      expect(fixture.environments).not.toHaveBeenCalled()
    }
  }
)
