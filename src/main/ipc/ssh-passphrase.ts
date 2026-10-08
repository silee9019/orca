import { currentRuntime } from './ssh-ipc-context'
import { setSshCredentialManagement } from '../ssh/ssh-target-registry'
import { ipcMain, type BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import { SSH_CREDENTIAL_TIMEOUT_MS, type SshCredentialKind } from '../ssh/ssh-connection-utils'
const pendingRequests = new Map<
  string,
  {
    resolve: (value: string | null) => void
    targetId: string
    kind: SshCredentialKind
    echo?: boolean
  }
>()

function notifyCredentialResolved(
  getMainWindow: () => BrowserWindow | null,
  requestId: string
): void {
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send('ssh:credential-resolved', { requestId })
  }
}

export function requestCredential(
  getMainWindow: () => BrowserWindow | null,
  targetId: string,
  kind: SshCredentialKind,
  detail: string,
  echo?: boolean,
  signal?: AbortSignal
): Promise<string | null> {
  const requestId = randomUUID()
  const { promise, resolve } = Promise.withResolvers<string | null>()
  let timer: ReturnType<typeof setTimeout>
  const finish = (value: string | null): void => {
    if (!pendingRequests.delete(requestId)) {
      return
    }
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
    currentRuntime?.notifySshCredentialObservation({ requests: listManagedSshCredentialRequests() })
    notifyCredentialResolved(getMainWindow, requestId)
    resolve(value)
  }
  const onAbort = (): void => finish(null)
  timer = setTimeout(() => finish(null), SSH_CREDENTIAL_TIMEOUT_MS)
  pendingRequests.set(requestId, { resolve: finish, targetId, kind, echo })
  currentRuntime?.notifySshCredentialObservation({ requests: listManagedSshCredentialRequests() })
  if (signal?.aborted) {
    finish(null)
    return promise
  }
  signal?.addEventListener('abort', onAbort, { once: true })

  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send('ssh:credential-request', { requestId, targetId, kind, detail, echo })
  }
  return promise
}

export function registerCredentialHandler(): void {
  setSshCredentialManagement({
    submitCredential: submitManagedSshCredential,
    listRequests: listManagedSshCredentialRequests
  })
  ipcMain.removeHandler('ssh:submitCredential')
  ipcMain.handle(
    'ssh:submitCredential',
    (_event, args: { requestId: string; value: string | null }) => submitManagedSshCredential(args)
  )
}

export function submitManagedSshCredential(args: {
  requestId: string
  value: string | null
}): boolean {
  const pending = pendingRequests.get(args.requestId)
  if (!pending) {
    return false
  }
  pending.resolve(args.value)
  return true
}

export function listManagedSshCredentialRequests(): {
  requestId: string
  targetId: string
  kind: SshCredentialKind
  echo?: boolean
}[] {
  return Array.from(pendingRequests, ([requestId, { targetId, kind, echo }]) => ({
    requestId,
    targetId,
    kind,
    echo
  }))
}
