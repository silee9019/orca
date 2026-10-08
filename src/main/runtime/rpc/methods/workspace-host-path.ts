import { isAbsolute } from 'node:path'
import type { z } from 'zod'
import {
  DesktopDirectoryCreate,
  DesktopHostPathExists
} from '../../../../shared/rpc-contract/workspace-host-path-params'
import { defineMethod } from '../core'

type CreateDirectory = (params: z.infer<typeof DesktopDirectoryCreate>) => Promise<void>
type PathExists = (params: z.infer<typeof DesktopHostPathExists>) => Promise<boolean>
let createDirectory: CreateDirectory | null = null
let pathExists: PathExists | null = null

export function setDesktopDirectoryCreateForRpc(command: CreateDirectory | null): void {
  createDirectory = command
}

export function setDesktopPathExistsForRpc(command: PathExists | null): void {
  pathExists = command
}

export const WORKSPACE_HOST_PATH_METHODS = [
  defineMethod({
    name: 'files.createDesktopDirectory',
    params: DesktopDirectoryCreate,
    handler: async (params) => {
      if (!createDirectory) {
        throw new Error('runtime_unavailable')
      }
      if (!params.connectionId && !isAbsolute(params.dirPath)) {
        throw new Error('Use an absolute path for the selected host.')
      }
      try {
        await createDirectory(params)
        return { created: true as const }
      } catch {
        throw new Error('Could not create the selected host directory.')
      }
    }
  }),
  defineMethod({
    name: 'files.desktopPathExists',
    params: DesktopHostPathExists,
    handler: async (params) => {
      if (!pathExists) {
        throw new Error('runtime_unavailable')
      }
      if (
        !params.connectionId &&
        (!isAbsolute(params.filePath) ||
          (params.access &&
            'documentPath' in params.access &&
            !isAbsolute(params.access.documentPath)))
      ) {
        throw new Error('Use absolute paths for the selected host.')
      }
      try {
        return await pathExists(params)
      } catch {
        throw new Error('Could not check the selected host path.')
      }
    }
  })
]
