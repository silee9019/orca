import path from 'node:path'
import { runProcess } from '../../../src/shared/child-process/run-process'

export async function callProjectFilterCli(
  userData: string,
  operation: 'get' | 'set' | 'clear',
  repoIds: string[] = []
) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('ORCA_'))
  )
  const result = await runProcess({
    program: process.execPath,
    args: [
      path.join(process.cwd(), 'out/cli/index.js'),
      'ui',
      'project-filter',
      operation,
      '--viewer',
      'host',
      '--json',
      ...repoIds.flatMap((id) => ['--repo', id])
    ],
    env: { ...env, ORCA_USER_DATA_PATH: userData, ORCA_BACKGROUND_LAUNCH: '1' },
    timeoutMs: 20000,
    detached: process.platform !== 'win32',
    terminationBarrier: true
  })
  if (result.timedOut) {
    throw new Error('project_filter_cli_timeout')
  }
  return JSON.parse(result.stdout)
}
