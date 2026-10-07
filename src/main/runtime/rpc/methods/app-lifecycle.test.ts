import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrcaRuntimeService } from '../../orca-runtime'
import { buildRegistry } from '../core'
import { APP_LIFECYCLE_METHODS } from './app-lifecycle'
import { DESKTOP_UPDATER_METHODS } from './desktop-updater'
import { DESKTOP_CLI_METHODS } from './desktop-cli'

const fixture = vi.hoisted(() => ({
  update: { state: 'idle' },
  check: vi.fn(),
  download: vi.fn(),
  install: vi.fn(),
  cliInstall: vi.fn(),
  cliStatus: vi.fn().mockResolvedValue({ state: 'installed' }),
  ensureConfigured: vi.fn()
}))
vi.mock('../../orca-runtime', () => ({
  OrcaRuntimeService: class {
    getRuntimeId() {
      return 'fixture-host'
    }
    getStatus() {
      return { desktopWindowStatus: 'available' }
    }
  }
}))
vi.mock('../../../updater', () => ({
  getUpdateStatus: () => fixture.update,
  checkForUpdatesFromMenu: fixture.check,
  downloadUpdate: fixture.download,
  quitAndInstall: fixture.install,
  dismissNudge: vi.fn(),
  dismissAvailableUpdate: vi.fn(),
  getLinuxPackageInstallInstructions: vi.fn(),
  showLinuxPackage: vi.fn(),
  listAvailableReleaseBuilds: vi.fn()
}))
vi.mock('../../../window/main-window-updater', () => ({
  ensureAutoUpdaterConfigured: fixture.ensureConfigured
}))
vi.mock('../../../ipc/cli', () => ({
  getCliInstallOperations: () => ({
    getInstallStatus: fixture.cliStatus,
    getWslInstallStatus: fixture.cliStatus,
    install: fixture.cliInstall,
    installWsl: fixture.cliInstall,
    remove: vi.fn(),
    removeWsl: vi.fn()
  })
}))
const registry = buildRegistry([
  ...APP_LIFECYCLE_METHODS,
  ...DESKTOP_UPDATER_METHODS,
  ...DESKTOP_CLI_METHODS
])
const context = { runtime: OrcaRuntimeService.prototype }
async function invoke(name: string, input?: unknown): Promise<unknown> {
  const method = registry.get(name)
  if (!method || 'stream' in method) {
    throw new Error('Missing method')
  }
  return method.handler(method.params ? method.params.parse(input) : undefined, context)
}
afterEach(() => {
  Reflect.deleteProperty(process.versions, 'electron')
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('app lifecycle RPC boundaries', () => {
  it('returns desktop unavailable on a headless host without importing desktop services', async () => {
    await expect(invoke('desktopUpdater.getStatus')).rejects.toMatchObject({
      code: 'desktop_unavailable'
    })
    expect(fixture.check).not.toHaveBeenCalled()
  })
  it('rejects a stale app incarnation before changing CLI registration', async () => {
    Object.defineProperty(process.versions, 'electron', { configurable: true, value: 'fixture' })
    await expect(
      invoke('desktopCli.install', { confirmTarget: 'another-runtime:old-incarnation' })
    ).rejects.toMatchObject({ code: 'target_mismatch' })
    expect(fixture.cliInstall).not.toHaveBeenCalled()
  })
  it('runs the existing desktop update check and reads back its actual progress', async () => {
    Object.defineProperty(process.versions, 'electron', { configurable: true, value: 'fixture' })
    fixture.check.mockImplementation(() => {
      fixture.update = { state: 'checking' }
    })
    await expect(
      invoke('desktopUpdater.check', { channel: 'rc', targetTag: 'v1.2.3-rc.1' })
    ).resolves.toEqual({ state: 'checking' })
    expect(fixture.ensureConfigured).toHaveBeenCalledOnce()
    expect(fixture.check).toHaveBeenCalledWith({ channel: 'rc', targetTag: 'v1.2.3-rc.1' })
  })
  it('rejects extra update fields and invalid WSL targets at the wire boundary', async () => {
    await expect(
      invoke('desktopUpdater.check', { channel: 'stable', run: 'arbitrary-code' })
    ).rejects.toThrow()
    await expect(invoke('desktopCli.getWslInstallStatus', { distro: ' ' })).rejects.toThrow()
  })
  it('keeps a platform read available on a headless host', async () => {
    await expect(invoke('app.platform')).resolves.toMatchObject({ platform: process.platform })
  })
})
