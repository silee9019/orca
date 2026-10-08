import type { z } from 'zod'
import type { DaemonManagementStopParams } from '../../shared/rpc-contract/daemon-management-params'
import type { PtyLivenessVerdict } from '../../shared/pty-liveness-verdict'
import { getDaemonProvider } from './daemon-init'
import type { DaemonPtyAdapter } from './daemon-pty-adapter'
import { DaemonPtyRouter } from './daemon-pty-router'
import { DegradedDaemonPtyProvider } from './degraded-daemon-pty-provider'

export function getDaemonManagementAdapters(): DaemonPtyAdapter[] {
  const provider = getDaemonProvider()
  if (!provider) {
    return []
  }
  return provider instanceof DaemonPtyRouter || provider instanceof DegradedDaemonPtyProvider
    ? [...provider.getAllAdapters()]
    : [provider]
}

export function isDaemonManagementDegraded(): boolean {
  const provider = getDaemonProvider()
  return (
    provider instanceof DegradedDaemonPtyProvider &&
    provider.routesFreshSpawnsToLocalProvider === true
  )
}

export async function listManagedDaemonSessions() {
  const adapters = getDaemonManagementAdapters()
  const observations = await Promise.all(
    adapters.map(async (adapter) => {
      try {
        const sessions = await adapter.listSessions()
        return {
          protocolVersion: adapter.protocolVersion,
          status: 'live' as const,
          supportsFencedStop: adapter.supportsIncarnationFencedKill(),
          sessions: sessions.map((row) => ({
            sessionId: row.sessionId,
            incarnationId: row.incarnationId,
            protocolVersion: adapter.protocolVersion,
            state: row.state,
            isAlive: row.isAlive,
            terminalHandle: row.terminalHandle,
            wslDistro: row.wslDistro,
            pid: row.pid,
            cwd: row.cwd,
            cols: row.cols,
            rows: row.rows,
            createdAt: row.createdAt
          }))
        }
      } catch {
        return { protocolVersion: adapter.protocolVersion, status: 'unverifiable' as const }
      }
    })
  )
  return {
    executionHostId: 'local' as const,
    complete: adapters.length > 0 && observations.every((row) => row.status === 'live'),
    degraded: isDaemonManagementDegraded(),
    observations
  }
}

export async function stopManagedDaemonSession(
  target: z.infer<typeof DaemonManagementStopParams>
): Promise<{ target: typeof target; verdict: PtyLivenessVerdict }> {
  const owners = getDaemonManagementAdapters().filter(
    (adapter) => adapter.protocolVersion === target.protocolVersion
  )
  const owner = owners.length === 1 ? owners[0] : undefined
  if (!owner) {
    return { target, verdict: { status: 'unverifiable', reason: 'No unique owning daemon.' } }
  }
  let sessions
  try {
    sessions = await owner.listSessions()
  } catch {
    return {
      target,
      verdict: { status: 'unverifiable', reason: 'The owning daemon could not be observed.' }
    }
  }
  const observed = sessions.find((row) => row.sessionId === target.sessionId)
  if (!observed || observed.incarnationId !== target.incarnationId) {
    throw new Error('session_incarnation_changed')
  }
  if (!owner.supportsIncarnationFencedKill()) {
    throw new Error('incarnation_fenced_kill_unsupported')
  }
  try {
    await owner.shutdown(target.sessionId, {
      immediate: true,
      expectedIncarnationId: target.incarnationId,
      deadlineMs: Date.now() + 7_000
    })
  } catch {
    // A failed request still needs the owning daemon's exit evidence.
  }
  try {
    const current = await owner.listSessions()
    const stillLive = current.some(
      (row) =>
        row.sessionId === target.sessionId &&
        row.incarnationId === target.incarnationId &&
        row.isAlive
    )
    return {
      target,
      verdict: stillLive ? { status: 'live', ptyIds: [target.sessionId] } : { status: 'exited' }
    }
  } catch {
    return {
      target,
      verdict: { status: 'unverifiable', reason: 'The owning daemon did not confirm exit.' }
    }
  }
}
