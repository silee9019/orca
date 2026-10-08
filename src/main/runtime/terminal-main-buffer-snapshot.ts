import type { OrcaRuntimeService } from './orca-runtime'
import type { RuntimeTerminalBufferSnapshot } from './runtime-terminal-state-records'
import type { PtyPendingDataDrainQueue } from '../ipc/pty-pending-data-drain-queue'
import { tryGetProviderForPty } from '../ipc/pty/provider/registry'
import { providerSnapshotRequiredPtys } from '../ipc/pty/delivery/visibility-state'

export type MainTerminalBufferSnapshot = RuntimeTerminalBufferSnapshot & {
  pendingDeliveryStartSeq?: number
  terminalOwner?: 'shell'
}

function normalizeSnapshotScrollbackRows(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }
  return Math.max(0, Math.min(50_000, Math.floor(value)))
}

export async function readMainTerminalBufferSnapshot(
  runtime: OrcaRuntimeService | undefined,
  pendingData: PtyPendingDataDrainQueue,
  args: { id?: unknown; opts?: { scrollbackRows?: unknown } }
): Promise<MainTerminalBufferSnapshot | null> {
  if (!runtime || typeof args?.id !== 'string' || args.id.length === 0) {
    return null
  }
  const scrollbackRows = normalizeSnapshotScrollbackRows(args.opts?.scrollbackRows)
  try {
    const runtimeSeqBeforeSnapshot = runtime.getPtyOutputSequence(args.id)
    const providerSnapshotRequired = providerSnapshotRequiredPtys.has(args.id)
    const providerSnapshot = providerSnapshotRequired
      ? await tryGetProviderForPty(args.id)?.getBufferSnapshot?.(args.id, {
          scrollbackRows
        })
      : null
    // Why: after a data gap main holds only the retained tail; returning it as a full snapshot would erase older scrollback.
    if (providerSnapshotRequired && !providerSnapshot) {
      return null
    }
    const snapshot =
      providerSnapshot ??
      (await runtime.serializeHiddenOutputRecoveryBuffer(args.id, {
        scrollbackRows
      }))
    if (!snapshot || typeof snapshot.seq !== 'number') {
      return snapshot
    }
    // Why: the renderer's post-restore dedupe needs this pending-queue bound, or a stale baseline swallows new chunks whose seq sits below the snapshot counter.
    const pending = pendingData.get(args.id)
    if (pending && typeof pending.startSeq !== 'number') {
      // Why: a seq-less backlog cannot be bounded — stay conservative.
      return snapshot
    }
    return {
      ...snapshot,
      pendingDeliveryStartSeq: Math.min(
        pending?.startSeq ?? (providerSnapshot ? runtimeSeqBeforeSnapshot : snapshot.seq),
        snapshot.seq
      )
    }
  } catch {
    return null
  }
}
