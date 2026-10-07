import { useEffect, useRef } from 'react'
import { registerUsageMenuController } from './usage-menu-controller'

export function useUsageMenuViewerController(
  usageMenuOpen: boolean,
  handleUsageMenuOpenChange: (open: boolean) => void,
  available = true,
  retainCurrentFocus?: () => void
): void {
  const menuRequestRef = useRef<{
    open: boolean
    resolve: (value: { open: boolean }) => void
    reject: (error: Error) => void
  } | null>(null)
  const retainFocusRef = useRef(retainCurrentFocus)
  retainFocusRef.current = retainCurrentFocus
  const changeMenuRef = useRef(handleUsageMenuOpenChange)
  changeMenuRef.current = handleUsageMenuOpenChange
  const menuOpenRef = useRef(usageMenuOpen)
  menuOpenRef.current = usageMenuOpen
  useEffect(() => {
    if (!available) {
      return
    }
    const unregister = registerUsageMenuController((open, retainFocus) => {
      if (menuRequestRef.current) {
        return Promise.reject(new Error('usage_menu_busy'))
      }
      if (menuOpenRef.current === open) {
        return Promise.resolve({ open })
      }
      return new Promise((resolve, reject) => {
        menuRequestRef.current = { open, resolve, reject }
        if (!open && retainFocus) {
          retainFocusRef.current?.()
        }
        changeMenuRef.current(open)
      })
    })
    return () => {
      unregister()
      menuRequestRef.current?.reject(new Error('usage_menu_unavailable'))
      menuRequestRef.current = null
    }
  }, [available])
  useEffect(() => {
    if (menuRequestRef.current?.open === usageMenuOpen) {
      menuRequestRef.current.resolve({ open: usageMenuOpen })
      menuRequestRef.current = null
    }
  }, [usageMenuOpen])
}
