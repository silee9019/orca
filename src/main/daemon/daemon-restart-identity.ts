import { createHash } from 'node:crypto'
import type { DaemonEndpointIdentity } from './daemon-hello-protocol'

export function daemonRestartIdentityDigest(identity: DaemonEndpointIdentity): string {
  return createHash('sha256')
    .update(JSON.stringify([identity.pid, identity.startedAtMs, identity.launchNonce]))
    .digest('hex')
}
export function assertDaemonRestartIdentity(
  actual: DaemonEndpointIdentity | null,
  expected: DaemonEndpointIdentity
): void {
  if (!actual || daemonRestartIdentityDigest(actual) !== daemonRestartIdentityDigest(expected)) {
    throw new Error('daemon_restart_owner_changed_or_unverifiable')
  }
}
