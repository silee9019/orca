import {
  runProcess,
  type ProcessSpec,
  type ProcessResult
} from '../../../src/shared/child-process/run-process'

export async function runViewerFixtureProcess(spec: ProcessSpec): Promise<ProcessResult> {
  const result = await runProcess({
    ...spec,
    env: { ...(spec.env ?? process.env), ORCA_BACKGROUND_LAUNCH: '1' }
  })
  if (result.code !== 0 || result.timedOut) {
    throw Object.assign(new Error(`viewer_fixture_process_failed: ${result.code}`), {
      stdout: result.stdout,
      stderr: result.stderr,
      timedOut: result.timedOut
    })
  }
  return result
}
