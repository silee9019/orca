import { ipcMain } from 'electron'
import type { CliInstallStatus } from '../../shared/cli-install-types'
import { resolveAppImageCacheKey } from '../cli/appimage-extracted-root'
import { CliInstaller } from '../cli/cli-installer'
import { runKeyedSerializedOperation } from '../cli/keyed-promise-queue'
import {
  recordWslCliRegistrationInstalled,
  recordWslCliRegistrationRemoved
} from '../cli/wsl-cli-registration-registry'
import { WslCliInstaller } from '../cli/wsl-cli-installer'
import { runSerializedWslCliRegistrationOperation } from '../cli/wsl-cli-registration-operation'
import { getCanonicalUserDataPath } from '../persistence'
import { hydrateShellPath, mergePathSegments } from '../startup/hydrate-shell-path'
import { getDefaultWslDistro } from '../wsl'
import { resolveAppImageRuntimeIdentity } from '../appimage-runtime-identity'

const APPIMAGE_REPAIR_RETRY_MS = 30_000
const localCliRegistrationQueues = new Map<string, Promise<void>>()

function runLocalCliRegistrationOperation<T>(operation: () => Promise<T>): Promise<T> {
  return runKeyedSerializedOperation(localCliRegistrationQueues, 'local', operation)
}

function resolveStaleAppImageRepairKey(status: CliInstallStatus): string | null {
  if (status.state !== 'stale') {
    return null
  }
  const runtimeIdentity = resolveAppImageRuntimeIdentity()
  if (!runtimeIdentity) {
    return null
  }
  const cacheKey = resolveAppImageCacheKey(runtimeIdentity.appImagePath)
  if (!cacheKey) {
    return null
  }
  return [status.commandPath, status.launcherPath, runtimeIdentity.appImagePath, cacheKey].join(
    '\0'
  )
}

function normalizeWslCliDistro(args?: { distro?: string | null }): string | undefined {
  return args?.distro?.trim() || undefined
}

function resolveWslCliDistro(args?: { distro?: string | null }): string | null {
  return normalizeWslCliDistro(args) ?? getDefaultWslDistro()
}

function runWslCliRegistrationOperation<T>(
  distro: string | null,
  operation: () => Promise<T>
): Promise<T> {
  return distro ? runSerializedWslCliRegistrationOperation(distro, operation) : operation()
}

async function persistWslCliRegistration(
  operation: () => Promise<void>,
  action: 'install' | 'remove'
): Promise<void> {
  try {
    await operation()
  } catch (error) {
    // Why: the WSL file operation already succeeded; advisory metadata must
    // not turn that success into a false Settings failure. The atomic write
    // left the prior registry intact, and repair is disk-authoritative, so a
    // stale entry self-corrects on the next startup probe.
    console.warn(
      `[wsl-cli] Failed to persist ${action} registration metadata:`,
      error instanceof Error ? error.message : String(error)
    )
  }
}

async function hydrateLocalShellPathForCli(force = false): Promise<void> {
  if (process.platform === 'win32') {
    return
  }
  // Why: CLI registration must match `which orca` in the user's terminal, not
  // the sparse PATH a GUI-launched Electron process inherited from launchd.
  const hydration = await hydrateShellPath(force ? { force: true } : undefined)
  if (hydration.ok) {
    mergePathSegments(hydration.segments)
  }
}

export function createCliInstallOperations() {
  let staleAppImageRepairAttempt: {
    promise: Promise<CliInstallStatus | null>
    retryAfter: number
  } | null = null
  return {
    getInstallStatus: async (): Promise<CliInstallStatus> => {
      await hydrateLocalShellPathForCli()
      const installer = new CliInstaller()
      const status = await installer.getStatus()
      // Why: an AppImage update replaces the outer file while the managed symlink still targets the prior extracted payload.
      const repairKey = resolveStaleAppImageRepairKey(status)
      if (!repairKey || installer.isAppImageRegistrationOwnedBySibling(status)) {
        return status
      }

      if (!staleAppImageRepairAttempt || Date.now() >= staleAppImageRepairAttempt.retryAfter) {
        const promise = runLocalCliRegistrationOperation(async () => {
          const currentInstaller = new CliInstaller()
          const currentStatus = await currentInstaller.getStatus()
          return resolveStaleAppImageRepairKey(currentStatus) === repairKey &&
            !currentInstaller.isAppImageRegistrationOwnedBySibling(currentStatus)
            ? currentInstaller.install()
            : currentStatus
        }).catch((error) => {
          console.warn(
            '[cli] Failed to repair stale AppImage registration:',
            error instanceof Error ? error.message : String(error)
          )
          return null
        })
        staleAppImageRepairAttempt = { promise, retryAfter: Number.POSITIVE_INFINITY }
        void promise.then((result) => {
          if (staleAppImageRepairAttempt?.promise !== promise) {
            return
          }
          staleAppImageRepairAttempt = result
            ? null
            : { ...staleAppImageRepairAttempt, retryAfter: Date.now() + APPIMAGE_REPAIR_RETRY_MS }
        })
      }
      return (await staleAppImageRepairAttempt.promise) ?? status
    },
    install: async (): Promise<CliInstallStatus> => {
      await hydrateLocalShellPathForCli(true)
      return runLocalCliRegistrationOperation(() => new CliInstaller().install())
    },
    remove: async (): Promise<CliInstallStatus> => {
      await hydrateLocalShellPathForCli()
      return runLocalCliRegistrationOperation(() => new CliInstaller().remove())
    },
    getWslInstallStatus: async (args?: { distro?: string | null }): Promise<CliInstallStatus> => {
      // Why: status is a read-only probe; queuing it behind a long-running
      // repair/install would hang the Settings spinner for its duration, and
      // Settings re-polls, so a rare transient read self-corrects.
      return new WslCliInstaller({ distro: resolveWslCliDistro(args) }).getStatus()
    },
    installWsl: async (args?: { distro?: string | null }): Promise<CliInstallStatus> => {
      const distro = resolveWslCliDistro(args)
      return runWslCliRegistrationOperation(distro, async () => {
        const status = await new WslCliInstaller({ distro }).install()
        if (distro && status.state === 'installed') {
          await persistWslCliRegistration(
            () => recordWslCliRegistrationInstalled(getCanonicalUserDataPath(), distro),
            'install'
          )
        }
        return status
      })
    },
    removeWsl: async (args?: { distro?: string | null }): Promise<CliInstallStatus> => {
      const distro = resolveWslCliDistro(args)
      return runWslCliRegistrationOperation(distro, async () => {
        const status = await new WslCliInstaller({ distro }).remove()
        if (distro && status.state === 'not_installed') {
          await persistWslCliRegistration(
            () => recordWslCliRegistrationRemoved(getCanonicalUserDataPath(), distro),
            'remove'
          )
        }
        return status
      })
    }
  }
}

const cliInstallOperations = createCliInstallOperations()
export function getCliInstallOperations(): ReturnType<typeof createCliInstallOperations> {
  return cliInstallOperations
}

export function registerCliHandlers(): void {
  const operations = getCliInstallOperations()
  ipcMain.handle('cli:getInstallStatus', () => operations.getInstallStatus())
  ipcMain.handle('cli:install', () => operations.install())
  ipcMain.handle('cli:remove', () => operations.remove())
  ipcMain.handle('cli:getWslInstallStatus', (_event, args?: { distro?: string | null }) =>
    operations.getWslInstallStatus(args)
  )
  ipcMain.handle('cli:installWsl', (_event, args?: { distro?: string | null }) =>
    operations.installWsl(args)
  )
  ipcMain.handle('cli:removeWsl', (_event, args?: { distro?: string | null }) =>
    operations.removeWsl(args)
  )
}
