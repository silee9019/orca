import type { Store } from './persistence'
import { resolveSshQuickOpenDiscoveryOptions } from './providers/ssh-quick-open-discovery-options'
import { getSshFilesystemProvider } from './providers/ssh-filesystem-dispatch'
import { listQuickOpenFiles } from './ipc/filesystem-list-files'
import {
  isFileNameFilterQueryTooLarge,
  pathMatchesFileNameFilterTokens,
  splitFileNameFilterTokens
} from '../shared/file-name-filter-tokens'
import { QuickOpenPathRanker } from '../shared/quick-open-path-search'

// 32 visible matches plus one truncation sentinel stays below the legacy frame ceiling.
const QUICK_OPEN_SSH_LEGACY_RESULT_LIMIT = 33

export type DesktopFileListArgs = {
  rootPath: string
  connectionId?: string
  excludePaths?: string[]
  maxResults?: number
  candidatePaths?: string[]
  searchQuery?: string
  includeIgnored?: boolean
  allowLegacyIncludeIgnored?: boolean
  followSymlinks?: boolean
  /** Local only: keep paths containing every whitespace-separated word, like the Explorer filter. */
  nameFilter?: string
}
export async function listDesktopFiles(
  store: Store,
  args: DesktopFileListArgs,
  signal?: AbortSignal
): Promise<string[]> {
  if (args.connectionId) {
    const provider = getSshFilesystemProvider(args.connectionId)
    // Why: no provider (cold start / disconnected) → return [] so quick-open shows "No matching files" instead of an error.
    if (!provider) {
      return []
    }
    const discovery = await resolveSshQuickOpenDiscoveryOptions(provider, args, signal)
    if (
      args.candidatePaths !== undefined &&
      !(await provider.supportsQuickOpenSearch?.({
        signal: signal,
        minimumVersion: 3
      }))
    ) {
      throw new Error('Update the remote host to validate Quick Open recent files.')
    }
    // Why: forward excludePaths or nested linked worktrees get double-scanned over SSH, causing timeout-induced partial results.
    if (
      args.searchQuery !== undefined &&
      provider.supportsQuickOpenSearch &&
      !(await provider.supportsQuickOpenSearch({
        signal: signal,
        minimumVersion: 1
      }))
    ) {
      const legacyFiles = await provider.listFiles(args.rootPath, {
        excludePaths: args.excludePaths,
        ...discovery,
        maxResults: QUICK_OPEN_SSH_LEGACY_RESULT_LIMIT,
        signal: signal
      })
      const ranker = new QuickOpenPathRanker(
        args.searchQuery,
        args.maxResults ?? QUICK_OPEN_SSH_LEGACY_RESULT_LIMIT
      )
      for (const file of legacyFiles) {
        ranker.consider(file)
      }
      return ranker.result().paths
    }
    return await provider.listFiles(args.rootPath, {
      candidatePaths: args.candidatePaths,
      excludePaths: args.excludePaths,
      ...discovery,
      ...(args.maxResults === undefined ? {} : { maxResults: args.maxResults }),
      ...(args.searchQuery === undefined ? {} : { searchQuery: args.searchQuery }),
      signal: signal
    })
  }
  if (args.nameFilter !== undefined && isFileNameFilterQueryTooLarge(args.nameFilter)) {
    return []
  }
  const nameFilterTokens = args.nameFilter ? splitFileNameFilterTokens(args.nameFilter) : []
  return await listQuickOpenFiles(
    args.rootPath,
    store,
    args.excludePaths,
    signal,
    args.maxResults,
    undefined,
    nameFilterTokens.length > 0
      ? (relativePath) => pathMatchesFileNameFilterTokens(relativePath, nameFilterTokens)
      : undefined,
    args
  )
}
