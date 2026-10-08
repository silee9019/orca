import type {
  ShellOpenExternalEditorRequest,
  ShellOpenExternalEditorResult,
  ShellOpenLocalPathResult
} from '../../../../shared/shell-open-types'
import {
  DesktopShellReveal,
  DesktopShellOpenEditor
} from '../../../../shared/rpc-contract/workspace-shell-action-params'
import { defineMethod } from '../core'

type DesktopShellActions = {
  reveal: (path: string) => Promise<ShellOpenLocalPathResult>
  openEditor: (request: ShellOpenExternalEditorRequest) => Promise<ShellOpenExternalEditorResult>
}
let desktopShellActions: DesktopShellActions | null = null
export function setDesktopShellActionsForRpc(actions: DesktopShellActions | null): void {
  desktopShellActions = actions
}
function requireDesktopShellActions(): DesktopShellActions {
  if (!desktopShellActions) {
    throw new Error('runtime_unavailable')
  }
  return desktopShellActions
}
export const WORKSPACE_SHELL_ACTION_METHODS = [
  defineMethod({
    name: 'shell.revealDesktopPath',
    params: DesktopShellReveal,
    handler: async (params) => {
      const actions = requireDesktopShellActions()
      let result: ShellOpenLocalPathResult
      try {
        result = await actions.reveal(params.path)
      } catch {
        throw new Error('Desktop file manager action failed.')
      }
      if (!result.ok) {
        throw new Error(`Desktop file manager action rejected: ${result.reason}`)
      }
      return result
    }
  }),
  defineMethod({
    name: 'shell.openDesktopEditor',
    params: DesktopShellOpenEditor,
    handler: async (params) => {
      const actions = requireDesktopShellActions()
      let result: ShellOpenExternalEditorResult
      try {
        result = await actions.openEditor({
          path: params.path,
          command: params.command,
          connectionId: params.connectionId
        })
      } catch {
        throw new Error('Desktop editor action failed.')
      }
      if (!result.ok) {
        throw new Error(`Desktop editor action rejected: ${result.reason}`)
      }
      return result
    }
  })
]
