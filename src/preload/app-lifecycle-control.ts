import { ipcRenderer } from 'electron'
import { AppLifecycleRequest } from '../shared/app-lifecycle-control'
import {
  prepareAndInvokeAppRestart,
  prepareAndInvokeUpdaterInstall
} from './renderer-restart-wiring'
import { awaitBeforeUnloadCheckpoint, updaterQuitAbortRelay } from './preload-runtime-support'

export function installAppLifecycleControl(): void {
  ipcRenderer.on('app-control:request', (_event, input: unknown) => {
    const parsed = AppLifecycleRequest.safeParse(input)
    if (!parsed.success) {
      return
    }
    const { requestId, action } = parsed.data
    const commit = (): Promise<unknown> => ipcRenderer.invoke('app-control:commit', requestId)
    const operation =
      action === 'install-update'
        ? prepareAndInvokeUpdaterInstall(
            window,
            updaterQuitAbortRelay,
            async () => {
              await commit()
            },
            awaitBeforeUnloadCheckpoint
          )
        : prepareAndInvokeAppRestart(window, commit, awaitBeforeUnloadCheckpoint)
    void operation.catch(() => ipcRenderer.send('app-control:failed', requestId))
  })
}
