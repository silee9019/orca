import { z } from 'zod'
import { DesktopWorktreeCreate } from './workspace-desktop-create-params'
export const DesktopProvisionedRootAdopt = DesktopWorktreeCreate.safeExtend({
  runtimeId: z.string().min(1).max(512),
  expectedPath: z.string().min(1).max(32768),
  expectedRefHead: z.string().min(1).max(256).optional(),
  setupDecision: z.literal('skip'),
  startup: z.never().optional(),
  sparseCheckout: z.never().optional(),
  parentWorkspace: z.never().optional()
})
export function getDesktopAdoptionConfirmation(
  params: z.infer<typeof DesktopProvisionedRootAdopt>
): string {
  return `${params.repoId}:${params.expectedRepoHostId}:${params.runtimeId}:${params.expectedPath}`
}
