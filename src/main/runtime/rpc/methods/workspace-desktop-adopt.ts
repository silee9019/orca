import type { z } from 'zod'
import { DesktopProvisionedRootAdopt } from '../../../../shared/rpc-contract/workspace-desktop-adopt-params'
import type { DesktopProvisionedRootAdoptionReceipt } from '../../../worktree-desktop-adoption-handlers'
import { defineMethod } from '../core'
type Adopt = (
  params: z.infer<typeof DesktopProvisionedRootAdopt>
) => Promise<DesktopProvisionedRootAdoptionReceipt>
let adopt: Adopt | null = null
export function setDesktopProvisionedRootAdoptionForRpc(value: Adopt | null): void {
  adopt = value
}
export const WORKSPACE_DESKTOP_ADOPT_METHODS = [
  defineMethod({
    name: 'worktree.adoptDesktopProvisionedRoot',
    params: DesktopProvisionedRootAdopt,
    handler: async (params) => {
      if (!adopt) {
        throw new Error('runtime_unavailable')
      }
      return adopt(params)
    }
  })
]
