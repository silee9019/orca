import { useEffect, useRef, type RefObject } from 'react'

export function useActivityThreadDensity(
  virtualizer: { measure: () => void },
  scrollContainerRef: RefObject<HTMLDivElement | null>,
  compactMode: boolean
): void {
  // Preserve initial measurements; invalidate only when density changes.
  const measuredCompactModeRef = useRef(compactMode)
  useEffect(() => {
    if (measuredCompactModeRef.current !== compactMode) {
      measuredCompactModeRef.current = compactMode
      virtualizer.measure()
    }
    scrollContainerRef.current
      ?.closest<HTMLElement>('[data-activity-viewer]')
      ?.setAttribute('data-activity-density-measured', String(compactMode))
  }, [virtualizer, scrollContainerRef, compactMode])
}
