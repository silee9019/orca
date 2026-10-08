import { replaceRuntimeEnvironmentRevisions } from './runtime-environment-revision'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type * as SnapshotModule from './web-runtime-session-snapshot'
import { createWebRuntimeSessionBrowserTab } from './web-runtime-browser-creation'
import { useAppStore } from '../store'
import { ENV, WT, resetWebSessionTabsSyncTestState } from './web-session-tabs-sync-test-harness'
import {
  installRuntimeTransport,
  pendingCreates,
  publishHostSnapshot,
  resetHostPages,
  seedPairedWorktree
} from './web-runtime-browser-creation-placement-test-rig'
vi.mock('./web-runtime-session-snapshot', async (importOriginal) => ({
  ...(await importOriginal<typeof SnapshotModule>()),
  refreshWebRuntimeSessionTabsSnapshot: vi.fn(async () => publishHostSnapshot())
}))
const initial = useAppStore.getInitialState()
beforeEach(() => {
  resetWebSessionTabsSyncTestState()
  resetHostPages()
  seedPairedWorktree()
  installRuntimeTransport()
  replaceRuntimeEnvironmentRevisions([{ id: ENV, createdAt: 1, pairingRevision: 1 }])
})
afterEach(() => {
  replaceRuntimeEnvironmentRevisions([])
  vi.unstubAllGlobals()
  useAppStore.setState(initial, true)
})
it('hands off staging and confirms the exact materialized existing creation owner', async () => {
  const receipts: unknown[] = []
  const result = createWebRuntimeSessionBrowserTab({
    worktreeId: WT,
    environmentId: ENV,
    placementPreference: 'server',
    focusOnCreate: true,
    onCreationReceipt: (receipt) => receipts.push(receipt)
  })
  expect(receipts).toEqual([{ phase: 'started' }])
  const pending = pendingCreates[0]
  expect(pending).toBeDefined()
  pending.resolve()
  await expect(result).resolves.toBe(true)
  expect(receipts).toEqual([
    { phase: 'started' },
    { phase: 'materialized', environmentId: ENV, worktreeId: WT, remotePageId: pending.params.page }
  ])
})

it('invalidates the receipt after same-environment re-pair without inventing idle or rollback', async () => {
  const receipts: unknown[] = []
  const result = createWebRuntimeSessionBrowserTab({
    worktreeId: WT,
    environmentId: ENV,
    placementPreference: 'server',
    onCreationReceipt: (receipt) => receipts.push(receipt)
  })
  replaceRuntimeEnvironmentRevisions([{ id: ENV, createdAt: 1, pairingRevision: 2 }])
  pendingCreates[0].resolve()
  await expect(result).resolves.toBe(true)
  expect(receipts).toEqual([{ phase: 'started' }, { phase: 'invalidated' }])
})
it('keeps the materialized creation when a receipt consumer throws', async () => {
  const result = createWebRuntimeSessionBrowserTab({
    worktreeId: WT,
    environmentId: ENV,
    placementPreference: 'server',
    onCreationReceipt: () => {
      throw new Error('fixture consumer')
    }
  })
  pendingCreates[0].resolve()
  await expect(result).resolves.toBe(true)
})
