import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  SkillLinksViewerActionSchema,
  type SkillLinksViewerAction
} from '../../../shared/skill-links-viewer-command'
import type { SkillCloudOwnedShare } from '../../../shared/skill-cloud-contract'

type RowAction = Exclude<SkillLinksViewerAction, { kind: 'get' }>
type Row = {
  share: SkillCloudOwnedShare
  confirming: 'revoke' | 'delete' | null
  expanded: boolean
  names: readonly string[] | null
  failed: boolean
  busy: boolean
  deleting: boolean
  setConfirming: (value: 'revoke' | 'delete' | null) => void
  setExpanded: (open: boolean) => void
  load: () => Promise<boolean>
  copy: () => Promise<void>
  revoke: () => void | Promise<boolean>
  deletePackage: () => Promise<boolean>
}
function rowSnapshot(row: Row) {
  return {
    shareId: row.share.id,
    confirming: row.confirming,
    expanded: row.expanded,
    names: row.names,
    failed: row.failed,
    busy: row.busy || row.deleting
  }
}
type RowControl = {
  id: string
  share: () => SkillCloudOwnedShare
  read: () => ReturnType<typeof rowSnapshot>
  apply: (action: RowAction) => Promise<boolean>
}
const mountedRows = new Set<RowControl>()
export function useSkillLinkRowViewerController(row: Row): void {
  const latest = useRef(row)
  useLayoutEffect(() => {
    latest.current = row
  })
  useEffect(() => {
    const control: RowControl = {
      id: row.share.id,
      share: () => latest.current.share,
      read: () => rowSnapshot(latest.current),
      apply: async (action) => {
        const current = latest.current
        if (current.busy || current.deleting) {
          throw new Error('viewer_busy')
        }
        switch (action.kind) {
          case 'confirm':
            current.setConfirming(action.value)
            return false
          case 'copy':
            await current.copy()
            return false
          case 'contents':
            current.setExpanded(action.open)
            if (action.open && !(await current.load())) {
              throw new Error('skill_link_contents_unavailable')
            }
            return false
          case 'execute':
            if (current.confirming !== action.operation) {
              throw new Error('skill_link_confirmation_required')
            }
            if (
              !(action.operation === 'revoke'
                ? await current.revoke()
                : await current.deletePackage())
            ) {
              throw new Error('skill_link_operation_failed')
            }
            return true
        }
      }
    }
    mountedRows.add(control)
    return () => {
      mountedRows.delete(control)
    }
  }, [row.share.id])
}
type View = {
  ownerKey?: string
  shares: readonly SkillCloudOwnedShare[]
  loading: boolean
  error: string | null
  busyShareId: string | null
  locked: boolean
}
function snapshot(view: View) {
  const visibleShareIds = view.shares.map((share) => share.id)
  const ids = new Set(visibleShareIds)
  return {
    viewer: 'desktop' as const,
    committed: true as const,
    executionHost: 'local' as const,
    visibleShareIds,
    rows: [...mountedRows].filter((row) => ids.has(row.id)).map((row) => row.read()),
    loading: view.loading,
    error: view.error,
    busyShareId: view.busyShareId
  }
}
export type SkillLinksViewerState = ReturnType<typeof snapshot> & {
  row?: ReturnType<typeof rowSnapshot> | { shareId: string; completed: true }
}
type Control = (action: SkillLinksViewerAction) => Promise<SkillLinksViewerState>
const mountedViews = new Set<Control>()
export async function applySkillLinksViewerAction(
  action: SkillLinksViewerAction
): Promise<SkillLinksViewerState> {
  const parsed = SkillLinksViewerActionSchema.parse(action)
  if (mountedViews.size !== 1) {
    throw new Error(mountedViews.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mountedViews.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control(parsed)
}
export function useSkillLinksViewerController(view: View): void {
  const latest = useRef(view)
  useLayoutEffect(() => {
    latest.current = view
  })
  const [, setRevision] = useState(0)
  type Request = {
    ready: boolean
    completed: boolean
    row: RowControl
    share: SkillCloudOwnedShare
    ownerKey: string | undefined
    resolve: (state: SkillLinksViewerState) => void
    reject: (error: Error) => void
  }
  const pending = useRef<Request | null>(null)
  useEffect(() => {
    const request = pending.current
    if (!request?.ready) {
      return
    }
    pending.current = null
    if (request.ownerKey !== view.ownerKey) {
      request.reject(new Error('viewer_owner_changed'))
    } else if (
      !request.completed &&
      (!mountedRows.has(request.row) ||
        request.row.share() !== request.share ||
        !view.shares.includes(request.share))
    ) {
      request.reject(new Error('skill_link_no_longer_visible'))
    } else {
      request.resolve({
        ...snapshot(view),
        row: request.completed ? { shareId: request.row.id, completed: true } : request.row.read()
      })
    }
  })
  useEffect(() => {
    const control: Control = async (action) => {
      const current = latest.current
      if (action.kind === 'get') {
        return snapshot(current)
      }
      if (pending.current || current.loading || current.busyShareId) {
        throw new Error('viewer_busy')
      }
      if (current.locked) {
        throw new Error('viewer_modal_open')
      }
      if (current.error) {
        throw new Error('skill_links_inventory_unavailable')
      }
      if (current.shares.filter((share) => share.id === action.id).length !== 1) {
        throw new Error('skill_link_not_visible')
      }
      const rows = [...mountedRows].filter((row) => row.id === action.id)
      const row = rows[0]
      if (rows.length !== 1 || !row) {
        throw new Error(rows.length ? 'viewer_ambiguous' : 'viewer_unavailable')
      }
      return new Promise((resolve, reject) => {
        const request: Request = {
          ready: false,
          completed: false,
          row,
          share: row.share(),
          ownerKey: current.ownerKey,
          resolve,
          reject
        }
        pending.current = request
        void row.apply(action).then(
          (completed) => {
            if (pending.current !== request) {
              return
            }
            request.completed = completed
            request.ready = true
            setRevision((value) => value + 1)
          },
          (error: unknown) => {
            if (pending.current !== request) {
              return
            }
            pending.current = null
            reject(error instanceof Error ? error : new Error('skill_link_action_failed'))
          }
        )
      })
    }
    mountedViews.add(control)
    return () => {
      mountedViews.delete(control)
      pending.current?.reject(new Error('viewer_unmounted'))
      pending.current = null
    }
  }, [])
}
