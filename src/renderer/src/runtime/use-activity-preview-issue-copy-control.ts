import { useCallback, useRef } from 'react'
import { publishActivityPreviewIssueCopyControl } from './activity-preview-issue-copy-controls'
export function useActivityPreviewIssueCopyControl(
  url: string | undefined,
  copy: () => Promise<boolean>
) {
  const cleanup = useRef<(() => void) | null>(null)
  return useCallback(
    (portal: HTMLDivElement | null): void => {
      cleanup.current?.()
      cleanup.current =
        portal && url ? publishActivityPreviewIssueCopyControl(portal, { url, copy }) : null
    },
    [url, copy]
  )
}
