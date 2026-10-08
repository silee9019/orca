import { spawnProcess } from '../shared/child-process/run-process'
import {
  capturedDigitRowChordsFromSymbolicHotkeysJson,
  type MacCapturedDigitRowChord
} from '../shared/macos-symbolic-hotkeys'

// Read live preferences rather than the potentially stale plist.
const MAC_SYMBOLIC_HOTKEYS_JSON_COMMAND = [
  '/usr/bin/defaults export com.apple.symbolichotkeys -',
  '/usr/bin/plutil -convert json -o - -'
].join(' | ')

export async function readMacCapturedDigitRowChords(
  readCommandStdout = readMacKeyboardCommandStdout
): Promise<MacCapturedDigitRowChord[]> {
  if (process.platform !== 'darwin') {
    return []
  }
  try {
    const stdout = await readCommandStdout(
      '/bin/sh',
      ['-c', MAC_SYMBOLIC_HOTKEYS_JSON_COMMAND],
      'Symbolic hotkeys probe timed out'
    )
    return capturedDigitRowChordsFromSymbolicHotkeysJson(JSON.parse(stdout))
  } catch {
    return []
  }
}

export function readMacKeyboardCommandStdout(
  command: string,
  args: string[],
  timeoutMessage: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false
    let child: ReturnType<typeof spawnProcess> | undefined

    // Kill the pipeline group, including children of the shell.
    const killTree = (): void => {
      if (!child?.pid) {
        return
      }
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        child.kill()
      }
    }

    // Match the desktop probe deadline.
    const timer = setTimeout(() => {
      if (settled) {
        return
      }
      settled = true
      killTree()
      reject(new Error(timeoutMessage))
    }, 500)

    const settle = (callback: () => void): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      callback()
    }

    try {
      child = spawnProcess({
        program: command,
        args,
        detached: true,
        stdio: ['ignore', 'pipe', 'ignore']
      })
      let stdout = ''
      child.stdout?.setEncoding('utf8')
      child.stdout?.on('data', (chunk: string) => {
        stdout += chunk
      })
      const failWith = (error: Error): void => {
        killTree()
        settle(() => reject(error))
      }
      // A stdout error must reject instead of crashing the host.
      child.stdout?.on('error', failWith)
      child.on('error', failWith)
      child.on('close', (code, signal) => {
        settle(() =>
          code === 0
            ? resolve(stdout)
            : reject(
                new Error(
                  `${command} exited with ${signal ? `signal ${signal}` : `code ${code ?? 'unknown'}`}`
                )
              )
        )
      })
    } catch (error) {
      settle(() => reject(error))
    }
  })
}
