import { app } from 'electron'
import { relaunchApp } from '../app-relaunch'
import { destroySystemTray } from '../tray/system-tray'
export type RegisterAppHandlersOptions = { onBeforeRelaunch?: () => void | Promise<void> }
export function configureDesktopAppRestart(options: RegisterAppHandlersOptions): void {
  appHandlerOptions = options
}
let appHandlerOptions: RegisterAppHandlersOptions | null = null

export async function requestDesktopAppRestart(mode: 'restart' | 'relaunch'): Promise<void> {
  if (!appHandlerOptions) {
    throw new Error('Desktop app handlers are unavailable')
  }
  await runBeforeRelaunchCleanup(appHandlerOptions.onBeforeRelaunch)
  setTimeout(() => {
    if (mode === 'relaunch') {
      destroySystemTray()
      relaunchApp('renderer-request')
      app.exit(0)
    } else {
      relaunchApp('admin-restart')
      app.quit()
    }
  }, 150)
}

async function runBeforeRelaunchCleanup(
  onBeforeRelaunch?: () => void | Promise<void>
): Promise<void> {
  try {
    await onBeforeRelaunch?.()
  } catch (error) {
    // Why: best-effort cleanup must never block relaunch; log only error.name to avoid leaking secrets.
    console.warn(
      '[app] Pre-relaunch cleanup failed; continuing relaunch:',
      error instanceof Error ? error.name : typeof error
    )
  }
}
