import type { z } from 'zod'
import {
  DesktopWorktreeRemove,
  DesktopWorktreeRemovalPreview
} from '../../../../shared/rpc-contract/workspace-desktop-remove-params'
import type { DesktopWorktreeRemovalServices } from '../../../worktree-desktop-removal-handlers'
import { defineMethod } from '../core'
let services: DesktopWorktreeRemovalServices | null = null
export function setDesktopWorktreeRemovalForRpc(
  value: DesktopWorktreeRemovalServices | null
): void {
  services = value
}
function requireServices(): DesktopWorktreeRemovalServices {
  if (!services) {
    throw new Error('runtime_unavailable')
  }
  return services
}
export const WORKSPACE_DESKTOP_REMOVE_METHODS = [
  defineMethod({
    name: 'worktree.previewDesktopRemoval',
    params: DesktopWorktreeRemovalPreview,
    handler: async (params: z.infer<typeof DesktopWorktreeRemovalPreview>) =>
      requireServices().preview(params)
  }),
  defineMethod({
    name: 'worktree.removeDesktop',
    params: DesktopWorktreeRemove,
    handler: async (params: z.infer<typeof DesktopWorktreeRemove>) =>
      requireServices().remove(params)
  })
]
