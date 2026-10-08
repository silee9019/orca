import { afterEach, expect, it, vi } from 'vitest'
import { runProcess } from '../../../src/shared/child-process/run-process'
import { runViewerFixtureProcess } from './viewer-fixture-process'
vi.mock('../../../src/shared/child-process/run-process', () => ({ runProcess: vi.fn() }))
afterEach(() => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
})

it('preserves a clean fixture environment through the existing hidden process runner', async () => {
  vi.stubEnv('ORCA_ENVIRONMENT', 'dev')
  vi.mocked(runProcess).mockResolvedValue({
    code: 0,
    signal: null,
    stdout: 'reply',
    stderr: '',
    timedOut: false
  })
  expect(
    (
      await runViewerFixtureProcess({
        program: process.execPath,
        args: ['cli'],
        env: { ORCA_USER_DATA_PATH: '/fixture' }
      })
    ).stdout
  ).toBe('reply')
  expect(runProcess).toHaveBeenCalledWith({
    program: process.execPath,
    args: ['cli'],
    env: { ORCA_USER_DATA_PATH: '/fixture', ORCA_BACKGROUND_LAUNCH: '1' }
  })
})
it('rejects nonzero or timed-out commands while preserving diagnostic output', async () => {
  for (const result of [
    { code: 1, signal: null, stdout: 'rejected', stderr: '', timedOut: false },
    { code: null, signal: null, stdout: 'pending', stderr: '', timedOut: true }
  ]) {
    vi.mocked(runProcess).mockResolvedValueOnce(result)
    await expect(runViewerFixtureProcess({ program: process.execPath })).rejects.toMatchObject({
      stdout: result.stdout,
      timedOut: result.timedOut
    })
  }
})
