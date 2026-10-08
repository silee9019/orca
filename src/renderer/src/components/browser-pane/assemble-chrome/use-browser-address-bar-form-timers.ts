import { useCallback, type MutableRefObject } from 'react'
export function useBrowserAddressBarFormTimers(
  blurCloseTimer: MutableRefObject<number | null>,
  closingResetTimer: MutableRefObject<number | null>
): (node: HTMLFormElement | null) => void {
  return useCallback(
    (node) => {
      if (node !== null) {
        return
      }
      for (const timer of [blurCloseTimer, closingResetTimer]) {
        if (timer.current !== null) {
          window.clearTimeout(timer.current)
          timer.current = null
        }
      }
    },
    [blurCloseTimer, closingResetTimer]
  )
}
