import { PROTOCOL_VERSION } from './types'
import type { z } from 'zod'
import type { DaemonRestartParams } from '../../shared/rpc-contract/daemon-restart-params'
import { getDaemonProvider } from './daemon-init'
import { getCurrentDaemonAdapter } from './daemon-provider-routing'
import { restartDaemon } from './daemon-provider-restart'
import { daemonRestartIdentityDigest } from './daemon-restart-identity'
import { isDaemonRestartInFlight } from './daemon-restart-state'

function target() {
  const provider = getDaemonProvider()
  if (!provider) {
    throw new Error('daemon_restart_unavailable')
  }
  const adapter = getCurrentDaemonAdapter(provider)
  if (adapter.protocolVersion !== PROTOCOL_VERSION) {
    throw new Error('daemon_restart_protocol_unverifiable')
  }
  const identity = adapter.getDaemonIdentity()
  if (!identity) {
    throw new Error('daemon_restart_owner_unverifiable')
  }
  return { provider, adapter, identity }
}
export function getDaemonRestartPlan(runtimeId: string) {
  const { adapter, identity } = target()
  return {
    runtimeId,
    executionHostId: 'local' as const,
    daemonIdentityDigest: daemonRestartIdentityDigest(identity),
    protocolVersion: adapter.protocolVersion,
    scope: 'current-protocol-daemon-and-native-fallbacks' as const,
    daemon: { pid: identity.pid, startedAtMs: identity.startedAtMs },
    busy: isDaemonRestartInFlight(),
    affectsAllCurrentProviderSessions: true,
    preservesLegacyProtocolDaemons: true
  }
}
export async function restartPinnedDaemon(
  runtimeId: string,
  params: z.infer<typeof DaemonRestartParams>
) {
  if (isDaemonRestartInFlight()) {
    throw new Error('daemon_restart_busy')
  }
  const selected = target()
  if (
    params.runtimeId !== runtimeId ||
    params.protocolVersion !== selected.adapter.protocolVersion ||
    params.daemonIdentityDigest !== daemonRestartIdentityDigest(selected.identity)
  ) {
    throw new Error('daemon_restart_owner_changed')
  }
  let result
  try {
    result = await restartDaemon({ provider: selected.provider, identity: selected.identity })
  } catch {
    throw new Error('daemon_restart_failed_or_unverifiable')
  }
  const replacement = getDaemonRestartPlan(runtimeId)
  const replacementObserved = replacement.daemonIdentityDigest !== params.daemonIdentityDigest
  return {
    requested: params,
    restarted: replacementObserved,
    replacement,
    interruptedSessionCount: result.killedCount,
    processExitConfirmed: false
  }
}
