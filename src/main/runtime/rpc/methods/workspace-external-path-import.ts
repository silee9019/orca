import { isAbsolute } from 'node:path'
import type { z } from 'zod'
import {
  DesktopDroppedPathsResolve,
  DesktopExternalPathImport
} from '../../../../shared/rpc-contract/workspace-external-path-import-params'
import type {
  ImportItemResult,
  ResolveDroppedPathsResult
} from '../../../../shared/filesystem-import-result-types'
import { defineMethod } from '../core'

type ExternalPathImport = {
  importPaths: (
    params: z.infer<typeof DesktopExternalPathImport>
  ) => Promise<{ results: ImportItemResult[] }>
  resolveDropped: (
    params: z.infer<typeof DesktopDroppedPathsResolve>
  ) => Promise<ResolveDroppedPathsResult>
}
let service: ExternalPathImport | null = null

export function setDesktopExternalPathImportForRpc(value: ExternalPathImport | null): void {
  service = value
}

function requireService(): ExternalPathImport {
  if (!service) {
    throw new Error('runtime_unavailable')
  }
  return service
}

// Why: sources always live on the desktop host; the target is host-local only without SSH.
function assertAbsolutePaths(sources: string[], localTarget: string | null): void {
  if (!sources.every((path) => isAbsolute(path)) || (localTarget && !isAbsolute(localTarget))) {
    throw new Error('Use absolute paths for the selected host.')
  }
}

export const WORKSPACE_EXTERNAL_PATH_IMPORT_METHODS = [
  defineMethod({
    name: 'files.importDesktopExternalPaths',
    params: DesktopExternalPathImport,
    handler: async (params) => {
      const current = requireService()
      assertAbsolutePaths(params.sourcePaths, params.connectionId ? null : params.destDir)
      try {
        return await current.importPaths(params)
      } catch {
        throw new Error('Could not import the selected paths.')
      }
    }
  }),
  defineMethod({
    name: 'files.resolveDesktopDroppedPaths',
    params: DesktopDroppedPathsResolve,
    handler: async (params) => {
      const current = requireService()
      assertAbsolutePaths(params.paths, params.connectionId ? null : params.worktreePath)
      try {
        return await current.resolveDropped(params)
      } catch {
        throw new Error('Could not resolve the selected paths.')
      }
    }
  })
]
