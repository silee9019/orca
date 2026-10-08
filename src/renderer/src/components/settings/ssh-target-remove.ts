import { removeSshTargetAfterSessionCleanup } from '../../../../shared/ssh-session-cleanup'

export type SshTargetRemoveApi = {
  terminateSessions: (args: { targetId: string }) => Promise<unknown>
  connect: (args: { targetId: string }) => Promise<unknown>
  removeTarget: (args: { id: string }) => Promise<unknown>
}

// Why: terminating remote PTYs is best-effort cleanup of the grace window.
// If the server is unreachable (dead host, blocked port, expired credentials),
// the reconnect-before-terminate path hangs on the handshake and the user is
// stuck with a target they cannot delete (issue #2626). Local removal must
// always succeed; the relay layer disposes any live session on its own side.
export async function removeSshTargetWithBestEffortCleanup(
  api: SshTargetRemoveApi,
  id: string
): Promise<void> {
  await removeSshTargetAfterSessionCleanup(api, id, (error) => {
    console.warn(
      '[ssh] Skipping remote session cleanup during target removal:',
      error instanceof Error ? error.message : String(error)
    )
  })
}
