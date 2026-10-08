import { basename } from 'node:path'
import type { Store } from './persistence'
import type { LocalFileAccess } from '../shared/local-file-access'
import type { SshMutationExpectation } from '../shared/ssh-types'
import type {
  ImportItemResult,
  ImportSkipReason,
  ResolveDroppedPathsResult
} from '../shared/filesystem-import-result-types'
import { resolveLocalDroppedPathsForAgent } from './ipc/dropped-path-resolution'
import { importOneSource } from './ipc/filesystem-import-local'
import { importExternalPathsSsh } from './ipc/filesystem-import-ssh'
import { resolveLocalRequestPath } from './ipc/local-file-access-resolution'
import { assertSshMutationExpectation } from './ssh/ssh-connection-generation'

export async function importExternalPathsForDesktop(
  store: Store,
  args: {
    sourcePaths: string[]
    destDir: string
    connectionId?: string
    ensureDir?: boolean
    access?: LocalFileAccess
  } & SshMutationExpectation
): Promise<{ results: ImportItemResult[] }> {
  assertSshMutationExpectation(
    args.connectionId,
    args.expectedSshTargetId,
    args.expectedSshConnectionGeneration,
    args.expectedExecutionHostId
  )
  if (args.connectionId) {
    return importExternalPathsSsh(args.sourcePaths, args.destDir, args.connectionId, {
      ensureDir: args.ensureDir,
      assertCurrent: () =>
        assertSshMutationExpectation(
          args.connectionId,
          args.expectedSshTargetId,
          args.expectedSshConnectionGeneration,
          args.expectedExecutionHostId
        )
    })
  }

  // Why: destDir must be authorized before any copy work begins. If the
  // destination is outside allowed roots, the entire import fails.
  // This only applies to local imports — remote paths are authorized by
  // the SSH connection boundary (see importExternalPathsSsh).
  // An image inserted into a document the user opened lands in that document's own folder.
  const resolvedDest = await resolveLocalRequestPath(
    args.destDir,
    args.access,
    store,
    'import-into'
  )

  const results: ImportItemResult[] = []
  const reservedNames = new Set<string>()

  for (const sourcePath of args.sourcePaths) {
    const result = await importOneSource(sourcePath, resolvedDest, reservedNames)
    results.push(result)
    if (result.status === 'imported') {
      reservedNames.add(basename(result.destPath))
    }
  }

  return { results }
}

export async function resolveDroppedPathsForDesktop(
  args: {
    paths: string[]
    worktreePath: string
    connectionId?: string
  } & SshMutationExpectation
): Promise<ResolveDroppedPathsResult> {
  assertSshMutationExpectation(
    args.connectionId,
    args.expectedSshTargetId,
    args.expectedSshConnectionGeneration,
    args.expectedExecutionHostId
  )
  // Why: `== null` (not `!args.connectionId`) so an empty string is
  // treated as a renderer error, not silently routed to the local branch.
  if (args.connectionId == null) {
    return {
      resolvedPaths: resolveLocalDroppedPathsForAgent(args.paths, args.worktreePath),
      skipped: [],
      failed: []
    }
  }
  const worktreePath = args.worktreePath.replace(/\/+$/, '')
  const destDir = `${worktreePath}/.orca/drops`
  const { results } = await importExternalPathsSsh(args.paths, destDir, args.connectionId, {
    ensureDir: true,
    assertCurrent: () =>
      assertSshMutationExpectation(
        args.connectionId,
        args.expectedSshTargetId,
        args.expectedSshConnectionGeneration,
        args.expectedExecutionHostId
      )
  })
  const resolvedPaths: string[] = []
  const skipped: { sourcePath: string; reason: ImportSkipReason }[] = []
  const failed: { sourcePath: string; reason: string }[] = []
  // Iterate in input order so injected paths align with the user's drop order.
  for (const r of results) {
    if (r.status === 'imported') {
      resolvedPaths.push(r.destPath)
    } else if (r.status === 'skipped') {
      skipped.push({ sourcePath: r.sourcePath, reason: r.reason })
    } else {
      failed.push({ sourcePath: r.sourcePath, reason: r.reason })
    }
  }
  return { resolvedPaths, skipped, failed }
}
