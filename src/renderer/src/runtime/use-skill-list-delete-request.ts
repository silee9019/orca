import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  applySkillsChildViewerAction,
  type SkillsChildViewerState
} from './skills-child-viewer-actions'
import type { SkillsViewerPage } from './skills-page-viewer-state'

type ChildAction = Parameters<typeof applySkillsChildViewerAction>[0]
type Request = {
  target: SkillsViewerPage['target']
  ready: boolean
  resolve: (state: SkillsChildViewerState) => void
  reject: (error: Error) => void
}

export function useSkillListDeleteRequest(page: SkillsViewerPage) {
  const latest = useRef(page)
  const pending = useRef<Request | null>(null)
  const [, setRevision] = useState(0)
  useLayoutEffect(() => {
    latest.current = page
  })
  useEffect(() => {
    const request = pending.current
    if (!request) {
      return
    }
    if (request.target !== page.target) {
      pending.current = null
      request.reject(new Error('viewer_target_changed'))
    } else if (request.ready && !page.deleteRunning) {
      pending.current = null
      request.resolve({})
    }
  })
  useEffect(
    () => () => {
      pending.current?.reject(new Error('viewer_unmounted'))
      pending.current = null
    },
    []
  )

  const apply = useCallback((action: ChildAction): Promise<SkillsChildViewerState> => {
    const deleting =
      action.kind === 'list-form' &&
      (action.action.kind === 'delete' ||
        (action.action.kind === 'detail-action' && action.action.action === 'delete'))
    if (!deleting) {
      return applySkillsChildViewerAction(action)
    }
    if (pending.current) {
      return Promise.reject(new Error('viewer_busy'))
    }
    return new Promise((resolve, reject) => {
      const request: Request = { target: latest.current.target, ready: false, resolve, reject }
      pending.current = request
      // The page owns completion when deleting the last row unmounts the list.
      void applySkillsChildViewerAction(action).then(
        () => {
          if (pending.current !== request) {
            return
          }
          request.ready = true
          setRevision((revision) => revision + 1)
        },
        (error: unknown) => {
          if (pending.current !== request) {
            return
          }
          pending.current = null
          reject(error instanceof Error ? error : new Error('skills_delete_not_completed'))
        }
      )
    })
  }, [])
  return useMemo(() => ({ pending, apply }), [apply])
}
