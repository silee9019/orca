import { z } from 'zod'
import { DesktopShellReveal } from './workspace-shell-action-params'

export const DesktopDocumentFileCopy = z
  .object({
    srcPath: DesktopShellReveal.shape.path,
    destPath: DesktopShellReveal.shape.path,
    documentPath: DesktopShellReveal.shape.path,
    expectedExecutionHostId: z.literal('local')
  })
  .strict()
