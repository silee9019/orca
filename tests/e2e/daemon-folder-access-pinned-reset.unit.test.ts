import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ reset: vi.fn(), read: vi.fn(), probe: vi.fn(), track: vi.fn() }))
vi.mock('electron', () => ({
  app: { getPath: () => '/Applications/Orca.app/Contents/MacOS/Orca' }
}))
vi.mock('../../src/main/macos-tcc-reset', () => ({
  readMacosBundleId: async () => 'fixture.bundle',
  resetMacosTccPermission: state.reset
}))
vi.mock('../../src/main/daemon/directory-enumeration-probe', () => ({
  enumerateDirectoryOnce: state.read
}))
vi.mock('../../src/main/telemetry/client', () => ({ track: state.track }))
vi.mock('../../src/main/daemon/daemon-folder-access-mismatch', () => ({
  getDaemonFolderAccessTarget: () => ({ canonicalPath: '/private-fixture', cwdClass: 'documents' }),
  getDaemonFolderAccessMismatch: () => ({
    daemonScope: 'fixture',
    cwdClass: 'documents',
    freshDaemonAccess: 'allowed'
  }),
  refreshDaemonFolderAccessProbe: state.probe
}))
import { resetFolderAccessForDaemon } from '../../src/main/daemon/daemon-folder-access-reset'
const platform = process.platform
beforeEach(() => {
  Object.defineProperty(process, 'platform', { configurable: true, value: 'darwin' })
  state.reset.mockReset().mockResolvedValue({ ok: true })
  state.read.mockReset().mockResolvedValue(undefined)
  state.probe.mockReset().mockResolvedValue(undefined)
  state.track.mockReset()
})
afterEach(() => {
  Object.defineProperty(process, 'platform', { configurable: true, value: platform })
})
it.each([1, 2, 3, 4, 5])(
  'checks pinned ownership at asynchronous boundary %s without falling through',
  async (boundary) => {
    let checks = 0
    await expect(
      resetFolderAccessForDaemon(
        { pid: 987654321, startedAtMs: 1, launchNonce: 'fixture' },
        {
          assertOwner: () => {
            if (++checks === boundary) {
              throw new Error('fixture owner changed')
            }
          }
        }
      )
    ).rejects.toThrow('fixture owner changed')
    expect(state.reset).toHaveBeenCalledTimes(boundary > 2 ? 1 : 0)
    expect(state.read).toHaveBeenCalledTimes(boundary > 3 ? 1 : 0)
    expect(state.probe).toHaveBeenCalledTimes(boundary > 4 ? 1 : 0)
    expect(state.track).not.toHaveBeenCalled()
  }
)
