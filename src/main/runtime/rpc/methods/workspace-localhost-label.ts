import type { LocalhostWorktreeLabelResult } from '../../../../shared/localhost-worktree-labels'
import { DesktopLocalhostLabel } from '../../../../shared/rpc-contract/workspace-localhost-label-params'
import { defineMethod } from '../core'
type RegisterLabel = (args: unknown) => Promise<LocalhostWorktreeLabelResult>
let register: RegisterLabel | null = null
export function setDesktopLocalhostLabelForRpc(value: RegisterLabel | null): void {
  register = value
}
export const WORKSPACE_LOCALHOST_LABEL_METHODS = [
  defineMethod({
    name: 'workspacePorts.registerDesktopLocalhostLabel',
    params: DesktopLocalhostLabel,
    handler: async (params) => {
      if (!register) {
        throw new Error('runtime_unavailable')
      }
      try {
        return await register(params)
      } catch {
        throw new Error('Desktop localhost label registration failed.')
      }
    }
  })
]
