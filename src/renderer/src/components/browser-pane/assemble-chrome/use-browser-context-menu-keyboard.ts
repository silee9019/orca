import type { BrowserPageContextMenuState } from '../describe-page/browser-page-types'
import { useCallback, useEffect, type RefObject } from 'react'
export function useBrowserContextMenuKeyboard(
  ref: RefObject<HTMLDivElement | null>,
  menu: BrowserPageContextMenuState | null,
  close: () => void
) {
  const menuItems = useCallback((): HTMLButtonElement[] => {
    return [
      ...(ref.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ??
        [])
    ]
  }, [ref])
  useEffect(() => {
    if (!menu) {
      return
    }
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', escape, true)
    return () => window.removeEventListener('keydown', escape, true)
  }, [close, menu])
  useEffect(() => {
    if (menu) {
      menuItems()[0]?.focus()
    }
  }, [menu, menuItems])
  return useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>): void => {
      const items = menuItems()
      if (items.length === 0) {
        return
      }
      const current =
        document.activeElement instanceof HTMLButtonElement
          ? items.indexOf(document.activeElement)
          : -1
      let next: number
      if (event.key === 'ArrowDown') {
        next = (current + 1) % items.length
      } else if (event.key === 'ArrowUp') {
        next = (current <= 0 ? items.length : current) - 1
      } else if (event.key === 'Home') {
        next = 0
      } else if (event.key === 'End') {
        next = items.length - 1
      } else {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      items[next]?.focus()
    },
    [menuItems]
  )
}
