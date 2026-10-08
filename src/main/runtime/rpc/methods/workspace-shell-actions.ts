import type {
  ShellOpenExternalEditorRequest,
  ShellOpenExternalEditorResult,
  ShellOpenLocalPathResult
} from '../../../../shared/shell-open-types'
import {
  DesktopShellOpenFile,
  DesktopShellOpenUri,
  DesktopShellReveal,
  DesktopShellOpenEditor
} from '../../../../shared/rpc-contract/workspace-shell-action-params'
import { defineMethod } from '../core'
import { parseDesktopFileUri } from '../../../shell-file-uri'

type DesktopShellActions = {
  openFile: (path: string) => Promise<boolean>
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
async function openDesktopFile(path: string): Promise<{ opened: true }> {
  const actions = requireDesktopShellActions()
  try {
    if (await actions.openFile(path)) {
      return { opened: true }
    }
  } catch {}
  throw new Error('Desktop file open failed.')
}
export const WORKSPACE_SHELL_ACTION_METHODS = [
  defineMethod({
    name: 'shell.openDesktopFile',
    params: DesktopShellOpenFile,
    handler: (params) => openDesktopFile(params.path)
  }),
  defineMethod({
    name: 'shell.openDesktopFileUri',
    params: DesktopShellOpenUri,
    handler: (params) => {
      requireDesktopShellActions()
      const path = parseDesktopFileUri(params.uri)
      if (path === null) {
        throw new Error('Use a local file URI.')
      }
      return openDesktopFile(path)
    }
  }),
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
