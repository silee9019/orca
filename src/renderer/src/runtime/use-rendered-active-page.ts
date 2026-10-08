import { useLayoutEffect, type RefObject } from 'react'

export function useRenderedActivePage(
  contentRef: RefObject<HTMLDivElement | null>,
  view: string
): void {
  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content) {
      return
    }
    content.dataset.renderedActivePage = view
    return () => {
      if (content.dataset.renderedActivePage === view) {
        delete content.dataset.renderedActivePage
      }
    }
  }, [contentRef, view])
}
