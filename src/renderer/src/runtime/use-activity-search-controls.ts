import { useLayoutEffect, useRef, type RefObject } from 'react'
import type { ActivityViewerSurface } from '../../../shared/rpc-contract/activity-viewer-params'
import { publishActivitySearchControl } from './activity-search-controls'

export function useActivitySearchControls(
  surface: ActivityViewerSurface,
  query: string,
  setQuery: (query: string) => void,
  input: RefObject<HTMLInputElement | null>,
  setShowSearch?: (visible: boolean) => Promise<void>
): void {
  const committedQuery = useRef(query)
  useLayoutEffect(() => {
    committedQuery.current = query
  }, [query])
  useLayoutEffect(
    () =>
      publishActivitySearchControl(surface, {
        getInput: () => input.current,
        getQuery: () => committedQuery.current,
        setQuery,
        ...(setShowSearch ? { setShowSearch } : {})
      }),
    [surface, input, setQuery, setShowSearch]
  )
}
