import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const cliEntry = path.join(process.cwd(), 'out', 'cli', 'index.js')

export type CliTerminalRow = { handle: string; tabId: string; leafId: string; worktreeId: string }

export type PersistedWorkspaceSession = {
  activeWorktreeId: string | null
  activeTabIdByWorktree: Record<string, string>
  terminalLayoutsByTabId: Record<string, { activeLeafId?: string | null }>
}

export function runCompiledCliJson<T>(userDataDir: string, args: string[]): T {
  const result = spawnSync(process.execPath, [cliEntry, ...args, '--json'], {
    env: { ...process.env, ORCA_USER_DATA_PATH: userDataDir, ORCA_DEV_CLI_INVOCATION: '1' },
    encoding: 'utf8'
  })
  if (result.status !== 0) {
    throw new Error(
      `orca ${args.join(' ')} exited ${result.status}: ${result.stderr}${result.stdout}`
    )
  }
  return JSON.parse(result.stdout).result
}

function runWithRequestFile<T>(userDataDir: string, args: string[], request: unknown): T {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'orca-e2e-cli-request-'))
  try {
    const requestFile = path.join(dir, 'request.json')
    writeFileSync(requestFile, JSON.stringify(request))
    return runCompiledCliJson<T>(userDataDir, [...args, '--request-file', requestFile])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

export function listCliTerminals(userDataDir: string): CliTerminalRow[] {
  return runCompiledCliJson<{ terminals: CliTerminalRow[] }>(userDataDir, ['terminal', 'list'])
    .terminals
}

// Why: renderer session writes are debounced, so read back only after the host flushed them.
export function readFlushedWorkspaceSession(userDataDir: string): PersistedWorkspaceSession {
  runWithRequestFile(userDataDir, ['terminal', 'flush-session'], { confirm: true })
  return runWithRequestFile<{ session: PersistedWorkspaceSession }>(
    userDataDir,
    ['terminal', 'session-state'],
    {}
  ).session
}
