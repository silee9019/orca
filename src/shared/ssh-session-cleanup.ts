import { SSH_TERMINATE_RECONNECT_REQUIRED } from './constants'

export type SshSessionCleanupApi<T> = {
  terminateSessions: (args: { targetId: string }) => Promise<T>
  connect: (args: { targetId: string }) => Promise<unknown>
}

export async function terminateSshSessionsAfterReconnect<T>(
  api: SshSessionCleanupApi<T>,
  targetId: string
): Promise<T> {
  try {
    return await api.terminateSessions({ targetId })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes(SSH_TERMINATE_RECONNECT_REQUIRED)) {
      throw error
    }
    await api.connect({ targetId })
    return api.terminateSessions({ targetId })
  }
}

export async function removeSshTargetAfterSessionCleanup<T>(
  api: SshSessionCleanupApi<T> & { removeTarget: (args: { id: string }) => Promise<unknown> },
  id: string,
  onCleanupError?: (error: unknown) => void
): Promise<{ failed: boolean; outcome?: T }> {
  let cleanup: { failed: boolean; outcome?: T }
  try {
    cleanup = { failed: false, outcome: await terminateSshSessionsAfterReconnect(api, id) }
  } catch (error) {
    cleanup = { failed: true }
    onCleanupError?.(error)
  }
  await api.removeTarget({ id })
  return cleanup
}
