import { useEffect, useState, type RefObject } from 'react'
export function useBrowserAddressBarWidth(
  slotRef: RefObject<HTMLDivElement | null>
): number | null {
  const [width, setWidth] = useState<number | null>(null)
  useEffect(() => {
    const slot = slotRef.current
    if (!slot || typeof ResizeObserver === 'undefined') {
      return
    }
    // Measure the stable slot so the expanded overlay cannot feed back into its own width.
    const syncWidth = (): void => setWidth(slot.getBoundingClientRect().width)
    syncWidth()
    const observer = new ResizeObserver(syncWidth)
    observer.observe(slot)
    return () => observer.disconnect()
  }, [slotRef])
  return width
}
