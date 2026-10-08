import { defineMethod } from '../core'

export const WORKSPACE_MACOS_HOTKEY_METHODS = [
  defineMethod({
    name: 'keybindings.macCapturedDigitRowChords',
    params: null,
    handler: (_params, { runtime }) => runtime.getMacCapturedDigitRowChords()
  })
]
