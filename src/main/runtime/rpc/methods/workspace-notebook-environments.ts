import type { z } from 'zod'
import type {
  PythonEnvironment,
  PythonEnvironments,
  CreateVenvResult
} from '../../../../shared/notebook-kernel-types'
import {
  NotebookEnvironmentList,
  NotebookPythonDescribe,
  NotebookVenvCreate,
  NotebookKernelInstall
} from '../../../../shared/rpc-contract/workspace-notebook-environment-params'
import { defineMethod } from '../core'

type DesktopNotebookEnvironments = {
  list: (params: z.infer<typeof NotebookEnvironmentList>) => Promise<PythonEnvironments>
  describe: (params: z.infer<typeof NotebookPythonDescribe>) => Promise<PythonEnvironment | null>
  create: (params: z.infer<typeof NotebookVenvCreate>) => Promise<CreateVenvResult>
  install: (
    params: z.infer<typeof NotebookKernelInstall>
  ) => Promise<{ ok: boolean; detail: string }>
}
let desktopNotebookEnvironments: DesktopNotebookEnvironments | null = null
export function setDesktopNotebookEnvironmentsForRpc(
  environments: DesktopNotebookEnvironments | null
): void {
  desktopNotebookEnvironments = environments
}
function requireDesktopNotebookEnvironments(): DesktopNotebookEnvironments {
  if (!desktopNotebookEnvironments) {
    throw new Error('runtime_unavailable')
  }
  return desktopNotebookEnvironments
}
export const WORKSPACE_NOTEBOOK_ENVIRONMENT_METHODS = [
  defineMethod({
    name: 'notebook.listDesktopEnvironments',
    params: NotebookEnvironmentList,
    handler: async (params) => {
      const environments = requireDesktopNotebookEnvironments()
      try {
        return await environments.list(params)
      } catch {
        throw new Error('Notebook environment discovery failed.')
      }
    }
  }),
  defineMethod({
    name: 'notebook.describeDesktopPython',
    params: NotebookPythonDescribe,
    handler: async (params) => {
      const environments = requireDesktopNotebookEnvironments()
      try {
        return await environments.describe(params)
      } catch {
        throw new Error('Notebook interpreter probe failed.')
      }
    }
  }),
  defineMethod({
    name: 'notebook.createDesktopVenv',
    params: NotebookVenvCreate,
    handler: async (params) => {
      const environments = requireDesktopNotebookEnvironments()
      try {
        const result = await environments.create(params)
        if (result.ok) {
          return result
        }
      } catch {}
      throw new Error('Notebook environment preparation failed.')
    }
  }),
  defineMethod({
    name: 'notebook.installDesktopIpykernel',
    params: NotebookKernelInstall,
    handler: async (params) => {
      const environments = requireDesktopNotebookEnvironments()
      try {
        const result = await environments.install(params)
        if (result.ok) {
          return { installed: true as const }
        }
      } catch {}
      throw new Error('Notebook kernel package installation failed.')
    }
  })
]
