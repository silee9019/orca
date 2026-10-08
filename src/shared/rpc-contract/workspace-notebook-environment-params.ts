import { z } from 'zod'
import { DesktopHostPathExists } from './workspace-host-path-params'

export const NotebookEnvironmentList = z
  .object({
    filePath: DesktopHostPathExists.shape.filePath,
    rootPath: DesktopHostPathExists.shape.filePath.nullable(),
    runWorkspaceInterpreters: z.boolean().default(false),
    expectedExecutionHostId: z.literal('local')
  })
  .strict()
export const NotebookPythonDescribe = z
  .object({ path: z.string().min(1), expectedExecutionHostId: z.literal('local') })
  .strict()
export const NotebookVenvCreate = NotebookEnvironmentList.omit({ runWorkspaceInterpreters: true })
  .extend({ python: z.string().min(1) })
  .strict()
export const NotebookKernelInstall = NotebookPythonDescribe.omit({ path: true })
  .extend({ python: z.string().min(1) })
  .strict()
