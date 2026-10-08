import type { createKeybindingFileOperations } from '../../../keybindings/keybinding-file-operations'
import { defineMethod } from '../core'

let operationsForRpc: ReturnType<typeof createKeybindingFileOperations> | null = null

export function setKeybindingFileOperationsForRpc(
  operations: ReturnType<typeof createKeybindingFileOperations> | null
): void {
  operationsForRpc = operations
}

function requireOperations(): NonNullable<typeof operationsForRpc> {
  if (!operationsForRpc) {
    throw new Error('Keybinding file service is not available on this runtime')
  }
  return operationsForRpc
}

export const WORKSPACE_KEYBINDING_FILE_METHODS = [
  defineMethod({
    name: 'keybindings.ensureFile',
    params: null,
    handler: async () => requireOperations().ensureFile()
  }),
  defineMethod({
    name: 'keybindings.openFile',
    params: null,
    handler: async () => requireOperations().openFile()
  }),
  defineMethod({
    name: 'keybindings.revealFile',
    params: null,
    handler: async () => requireOperations().revealFile()
  })
] as const
