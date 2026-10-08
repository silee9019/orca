import { ipcMain } from 'electron'
import {
  readMacCapturedDigitRowChords,
  type readMacKeyboardCommandStdout
} from '../macos-keyboard-probes'

export function registerMacSymbolicHotkeysProbeHandler(
  readCommandStdout: typeof readMacKeyboardCommandStdout
): void {
  ipcMain.handle('app:getMacCapturedDigitRowChords', () =>
    readMacCapturedDigitRowChords(readCommandStdout)
  )
}
