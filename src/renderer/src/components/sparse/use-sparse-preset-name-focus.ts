import { useCallback, useEffect, useRef } from 'react'
export function useSparsePresetNameFocus() {
  const input = useRef<HTMLInputElement | null>(null)
  const frame = useRef<number | null>(null)
  const cancel = useCallback(() => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current)
      frame.current = null
    }
  }, [])
  useEffect(() => cancel, [cancel])
  const setNameInputNode = useCallback(
    (node: HTMLInputElement | null) => {
      if (!node) {
        cancel()
      }
      input.current = node
    },
    [cancel]
  )
  const focusName = useCallback(() => {
    cancel()
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      input.current?.focus()
      input.current?.select()
      input.current?.closest('[data-sparse-preset-editor]')?.scrollIntoView({ block: 'start' })
    })
  }, [cancel])
  return { setNameInputNode, focusName }
}
