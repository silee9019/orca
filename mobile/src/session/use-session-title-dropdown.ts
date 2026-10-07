import { useCallback, useEffect, useRef, useState } from 'react'
import { getCachedWorktrees, setCachedWorktrees } from '../cache/worktree-cache'
import { loadPinnedIds } from '../storage/preferences'
import type { RpcClient } from '../transport/rpc-client'
import type { ConnectionState } from '../transport/types'
import type { Worktree } from '../worktree/workspace-list-sections'
import { WorktreeCatalogSnapshotClient } from '../worktree/worktree-catalog-snapshot-client'

/** Open state plus the host's worktree list, shown from cache at once and refreshed on each open. */
export function useSessionTitleDropdown(args: {
  hostId: string | undefined
  client: RpcClient | null
  connState: ConnectionState
}) {
  const { hostId, client, connState } = args
  const [open, setOpen] = useState(false)
  const [worktrees, setWorktrees] = useState<Worktree[]>([])
  const [localPins, setLocalPins] = useState<Set<string>>(() => new Set())
  const catalogRef = useRef(new WorktreeCatalogSnapshotClient())

  const show = useCallback(() => {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the cache holds the rows the host list admitted as `Worktree`, and the host screen reads it with this same cast.
    const cached = hostId ? (getCachedWorktrees(hostId) as Worktree[] | null) : null
    setWorktrees(cached ?? [])
    setOpen(true)
    if (hostId) {
      void loadPinnedIds(hostId).then(setLocalPins)
    }
  }, [hostId])
  const hide = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open || !client || connState !== 'connected' || !hostId) {
      return
    }
    let disposed = false
    void catalogRef.current
      .fetch(client, hostId)
      .then((result) => {
        if (disposed || result.kind !== 'response') {
          return
        }
        const confirmed = catalogRef.current.admit(result.pending)
        if (confirmed) {
          setWorktrees(confirmed)
          setCachedWorktrees(hostId, confirmed, { proven: true })
        }
      })
      .catch(() => null)
    return () => {
      disposed = true
    }
  }, [open, client, connState, hostId])

  return { open, show, hide, worktrees, localPins }
}
