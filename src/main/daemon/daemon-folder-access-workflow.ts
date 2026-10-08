import { createHash } from 'node:crypto'
import { isMacTccFolderClass } from '../../shared/daemon-adoption-telemetry'
import type { DaemonFolderAccessStatusParams } from '../../shared/rpc-contract/daemon-folder-access-params'
import { DaemonFolderAccessReceipt } from '../../shared/rpc-contract/daemon-folder-access-params'
import type { z } from 'zod'
import { getDaemonRestartPlan } from './daemon-restart-control'
import { getDaemonProvider } from './daemon-init'
import { getCurrentDaemonAdapter } from './daemon-provider-routing'
import { daemonRestartIdentityDigest } from './daemon-restart-identity'
import {
  getDaemonFolderAccessTarget,
  getDaemonFolderAccessMismatch,
  refreshDaemonFolderAccessProbe
} from './daemon-folder-access-mismatch'
import { resetFolderAccessForDaemon } from './daemon-folder-access-reset'

type Entry = {
  pin: DaemonFolderAccessStatusParams
  state: z.output<typeof DaemonFolderAccessReceipt>['state']
  running: boolean
  verifying: boolean
  access: 'allowed' | 'denied' | 'unknown'
  expiresAt: number
}
const operations = new WeakMap<object, Entry>()
const RETENTION_MS = 30 * 60_000

function target(runtimeId: string) {
  if (process.platform !== 'darwin') {
    throw new Error('folder_access_unsupported')
  }
  const plan = getDaemonRestartPlan(runtimeId)
  if (plan.busy) {
    throw new Error('folder_access_daemon_busy')
  }
  const provider = getDaemonProvider()
  const identity = provider && getCurrentDaemonAdapter(provider).getDaemonIdentity()
  if (!identity || daemonRestartIdentityDigest(identity) !== plan.daemonIdentityDigest) {
    throw new Error('folder_access_owner_changed')
  }
  const folder = getDaemonFolderAccessTarget(identity)
  if (!folder || !isMacTccFolderClass(folder.cwdClass)) {
    throw new Error('folder_access_unsupported')
  }
  const targetDigest = createHash('sha256')
    .update(JSON.stringify([plan.daemonIdentityDigest, folder.canonicalPath, folder.cwdClass]))
    .digest('hex')
  return {
    identity,
    plan: {
      runtimeId,
      executionHostId: 'local' as const,
      daemonIdentityDigest: plan.daemonIdentityDigest,
      targetDigest,
      cwdClass: folder.cwdClass,
      humanResponseRequired: true as const,
      resetsAppFolderPermission: true as const
    }
  }
}
export function planDaemonFolderAccess(runtimeId: string) {
  return target(runtimeId).plan
}
function assertPin(runtimeId: string, pin: DaemonFolderAccessStatusParams) {
  const selected = target(runtimeId)
  if (
    pin.runtimeId !== runtimeId ||
    pin.daemonIdentityDigest !== selected.plan.daemonIdentityDigest ||
    pin.targetDigest !== selected.plan.targetDigest
  ) {
    throw new Error('folder_access_owner_changed')
  }
  return selected.identity
}
function entryFor(owner: object, pin: DaemonFolderAccessStatusParams) {
  const entry = operations.get(owner)
  if (
    !entry ||
    Object.entries(entry.pin).some(([key, value]) => Reflect.get(pin, key) !== value) ||
    (!entry.running && Date.now() > entry.expiresAt)
  ) {
    throw new Error('folder_access_operation_unavailable')
  }
  return entry
}
function receipt(entry: Entry) {
  const access = entry.access
  return DaemonFolderAccessReceipt.parse({
    ...entry.pin,
    state: entry.state,
    resetWorkInFlight: entry.running,
    freshDaemonAccess: access,
    permissionConfirmed: entry.state === 'verified',
    osPromptMayRemain: true,
    cancellationUndoesPermissionReset: false
  })
}
export function startDaemonFolderAccess(
  owner: object,
  runtimeId: string,
  pin: DaemonFolderAccessStatusParams
) {
  const identity = assertPin(runtimeId, pin)
  const existing = operations.get(owner)
  if (existing && existing.pin.operationId === pin.operationId) {
    return receipt(entryFor(owner, pin))
  }
  if (existing && (existing.running || existing.verifying || Date.now() <= existing.expiresAt)) {
    throw new Error('folder_access_operation_busy')
  }
  const entry: Entry = {
    pin: { ...pin },
    state: 'running',
    running: true,
    verifying: false,
    access: 'unknown',
    expiresAt: Date.now() + RETENTION_MS
  }
  operations.set(owner, entry)
  const assertOwner = () => {
    assertPin(runtimeId, pin)
    if (entry.state === 'cancelled') {
      throw new Error('folder_access_cancelled')
    }
  }
  void resetFolderAccessForDaemon(identity, { assertOwner })
    .then((result) => {
      assertOwner()
      entry.state = result.outcome === 'probed' ? 'awaiting_human' : 'failed'
    })
    .catch(() => {
      if (entry.state !== 'cancelled') {
        entry.state = 'failed'
      }
    })
    .finally(() => {
      entry.running = false
      entry.expiresAt = Date.now() + RETENTION_MS
    })
  return receipt(entry)
}
export function getDaemonFolderAccessOperation(
  owner: object,
  runtimeId: string,
  pin: DaemonFolderAccessStatusParams
) {
  assertPin(runtimeId, pin)
  return receipt(entryFor(owner, pin))
}
export function cancelDaemonFolderAccess(
  owner: object,
  runtimeId: string,
  pin: DaemonFolderAccessStatusParams
) {
  if (pin.runtimeId !== runtimeId) {
    throw new Error('folder_access_owner_changed')
  }
  const entry = entryFor(owner, pin)
  entry.state = 'cancelled'
  entry.access = 'unknown'
  return receipt(entry)
}
export async function verifyDaemonFolderAccess(
  owner: object,
  runtimeId: string,
  pin: DaemonFolderAccessStatusParams
) {
  const identity = assertPin(runtimeId, pin),
    entry = entryFor(owner, pin)
  if (entry.running || entry.verifying || !['awaiting_human', 'verified'].includes(entry.state)) {
    throw new Error('folder_access_not_ready_to_verify')
  }
  entry.verifying = true
  try {
    await refreshDaemonFolderAccessProbe(identity, { force: true })
    assertPin(runtimeId, pin)
    if (entry.state === 'cancelled') {
      return receipt(entry)
    }
    const access = getDaemonFolderAccessMismatch(identity)?.freshDaemonAccess ?? 'unknown'
    entry.access = access
    entry.state = access === 'allowed' ? 'verified' : 'awaiting_human'
    return { ...receipt(entry), freshDaemonAccess: access }
  } catch {
    throw new Error('folder_access_verification_unverifiable')
  } finally {
    entry.verifying = false
  }
}
