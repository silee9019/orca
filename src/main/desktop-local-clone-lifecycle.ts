import type { ChildProcess } from 'node:child_process'
import { cleanupClaimedCloneTarget, type ClaimedCloneTarget } from './git/repo-clone-path'
export type ActiveCloneMetadata = {
  path: string
  pathKey: string
  claimedTarget: ClaimedCloneTarget
  process: ChildProcess
  abortRequested: boolean
  generation: number
  pendingAbortCleanup: Promise<void> | null
  resolvePendingAbortCleanup: (() => void) | null
}

// Why: module-scoped so the abort handle survives macOS window re-creation, when registerRepoHandlers re-runs.
let activeClone: ActiveCloneMetadata | null = null
const pendingLocalCloneControllers = new Set<AbortController>()
let nextCloneGeneration = 1
const latestCloneGenerationByPath = new Map<string, number>()
const pendingAbortCleanupByPath = new Map<string, Promise<void>>()

export async function cleanupOwnedCloneTarget(metadata: ActiveCloneMetadata): Promise<void> {
  if (!metadata.claimedTarget.canCleanup || !metadata.claimedTarget.ownedDirectoryIdentity) {
    return
  }
  if (latestCloneGenerationByPath.get(metadata.pathKey) !== metadata.generation) {
    return
  }
  // Why: a fast retry may attach a newer process before the aborted one closes; the old close handler must not delete it.
  if (
    activeClone &&
    activeClone.process !== metadata.process &&
    activeClone.pathKey === metadata.pathKey
  ) {
    return
  }

  if (latestCloneGenerationByPath.get(metadata.pathKey) !== metadata.generation) {
    return
  }
  await cleanupClaimedCloneTarget(metadata.path, metadata.claimedTarget)
}

export function markCloneAbortCleanupPending(metadata: ActiveCloneMetadata): void {
  if (metadata.resolvePendingAbortCleanup) {
    return
  }
  metadata.pendingAbortCleanup = new Promise<void>((resolve) => {
    metadata.resolvePendingAbortCleanup = resolve
  })
  pendingAbortCleanupByPath.set(metadata.pathKey, metadata.pendingAbortCleanup)
}

export function settleCloneAbortCleanup(metadata: ActiveCloneMetadata): void {
  if (pendingAbortCleanupByPath.get(metadata.pathKey) === metadata.pendingAbortCleanup) {
    pendingAbortCleanupByPath.delete(metadata.pathKey)
  }
  metadata.resolvePendingAbortCleanup?.()
  metadata.pendingAbortCleanup = null
  metadata.resolvePendingAbortCleanup = null
}

export function abortRendererLocalClone(): void {
  for (const controller of pendingLocalCloneControllers) {
    controller.abort()
  }
  pendingLocalCloneControllers.clear()
  if (activeClone) {
    const clone = activeClone
    requestLocalCloneAbort(clone)
    activeClone = null
  }
}
export function requestLocalCloneAbort(metadata: ActiveCloneMetadata): void {
  metadata.abortRequested = true
  markCloneAbortCleanupPending(metadata)
  metadata.process.kill()
}
export function waitForLocalCloneAbortCleanup(pathKey: string) {
  return pendingAbortCleanupByPath.get(pathKey)
}
export function trackPendingRendererClone(controller: AbortController) {
  pendingLocalCloneControllers.add(controller)
}
export function releasePendingRendererClone(controller: AbortController) {
  pendingLocalCloneControllers.delete(controller)
}
export function trackLocalClone(
  path: string,
  pathKey: string,
  claimedTarget: ClaimedCloneTarget,
  process: ChildProcess,
  rendererOwned: boolean
): ActiveCloneMetadata {
  const generation = nextCloneGeneration++
  latestCloneGenerationByPath.set(pathKey, generation)
  const metadata: ActiveCloneMetadata = {
    path,
    pathKey,
    claimedTarget,
    process,
    abortRequested: false,
    generation,
    pendingAbortCleanup: null,
    resolvePendingAbortCleanup: null
  }
  if (rendererOwned) {
    activeClone = metadata
  }
  return metadata
}
export async function finishLocalClone(
  metadata: ActiveCloneMetadata,
  succeeded: boolean
): Promise<void> {
  if (activeClone?.process === metadata.process) {
    activeClone = null
  }
  if (!succeeded) {
    await cleanupOwnedCloneTarget(metadata)
  }
  if (metadata.abortRequested && !succeeded) {
    settleCloneAbortCleanup(metadata)
  }
  if (latestCloneGenerationByPath.get(metadata.pathKey) === metadata.generation) {
    latestCloneGenerationByPath.delete(metadata.pathKey)
  }
}
