import type { RefObject } from 'react'
export function focusRemoteFileBrowserInput(
  inputRef: RefObject<HTMLInputElement | null>,
  event?: { preventDefault: () => void }
): void {
  event?.preventDefault()
  inputRef.current?.focus()
}
