import { useCallback, useMemo, type RefObject } from 'react'
import { browseRuntimeServerDirectory } from '@/runtime/runtime-server-directory-browser'
import type { DirEntry } from './remote-file-browser-helpers'
import type { FilesystemPathFlavor } from '../../../../shared/filesystem-entry-types'

export type BrowseResult = {
  resolvedPath: string
  entries: DirEntry[]
  pathFlavor: FilesystemPathFlavor
}

export type FetchListing = (dirPath: string) => Promise<BrowseResult>

export type RemoteFileBrowserListing = {
  fetchListing: FetchListing
  homePathRef: RefObject<string | null>
}

export function useRemoteFileBrowserListing(
  targetId: string | undefined,
  runtimeEnvironmentId: string | undefined
): RemoteFileBrowserListing {
  const listingState = useMemo(() => {
    const home: { current: string | null } = { current: null }
    return { targetId, runtimeEnvironmentId, cache: new Map<string, BrowseResult>(), home }
  }, [targetId, runtimeEnvironmentId])
  const { cache: listingCache, home: homePathRef } = listingState

  const fetchListing = useCallback(
    async (dirPath: string): Promise<BrowseResult> => {
      const cached = listingCache.get(dirPath)
      if (cached) {
        return cached
      }
      const result = targetId
        ? await window.api.ssh.browseDir({ targetId, dirPath })
        : await browseRuntimeServerDirectory(
            requireRuntimeEnvironmentId(runtimeEnvironmentId),
            dirPath
          )
      listingCache.set(result.resolvedPath, result)
      // Also key by the requested dirPath (e.g. `~`, relative) so an identical request doesn't re-hit the SSH backend.
      if (dirPath !== result.resolvedPath) {
        listingCache.set(dirPath, result)
      }
      return result
    },
    [runtimeEnvironmentId, targetId, listingCache]
  )

  return { fetchListing, homePathRef }
}

function requireRuntimeEnvironmentId(runtimeEnvironmentId: string | undefined): string {
  if (!runtimeEnvironmentId) {
    throw new Error('Runtime environment is required')
  }
  return runtimeEnvironmentId
}
