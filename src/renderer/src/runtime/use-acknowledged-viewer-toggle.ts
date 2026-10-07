import { useCallback, useEffect, useRef } from 'react'

export function useAcknowledgedViewerToggle(
  open: boolean,
  change: (next: boolean) => void,
  scopeKey?: string
) {
  const latest = useRef({ open, change, scopeKey })
  latest.current = { open, change, scopeKey }
  const pending = useRef<{
    open: boolean
    scopeKey?: string
    resolve: (value: { open: boolean }) => void
    reject: (error: Error) => void
  } | null>(null)
  useEffect(() => {
    if (pending.current && pending.current.scopeKey !== scopeKey) {
      pending.current.reject(new Error('viewer_control_target_changed'))
      pending.current = null
    }
    if (pending.current?.open === open) {
      pending.current.resolve({ open })
      pending.current = null
    }
  }, [open, scopeKey])
  useEffect(
    () => () => {
      pending.current?.reject(new Error('viewer_control_unmounted'))
      pending.current = null
    },
    [scopeKey]
  )
  return useCallback((next: boolean): Promise<{ open: boolean }> => {
    if (pending.current) {
      return Promise.reject(new Error('viewer_control_busy'))
    }
    if (latest.current.open === next) {
      latest.current.change(next)
      return Promise.resolve({ open: next })
    }
    return new Promise((resolve, reject) => {
      pending.current = { open: next, scopeKey: latest.current.scopeKey, resolve, reject }
      latest.current.change(next)
    })
  }, [])
}
