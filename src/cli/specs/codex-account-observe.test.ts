import { afterEach, expect, it, vi } from 'vitest'
import { CODEX_ACCOUNT_OBSERVE_COMMAND_SPECS } from './codex-account-observe'
import { COMMAND_SPECS } from './index'
import { HANDLER_COMMAND_KEYS, dispatch } from '../dispatch'
import { CLI_COMMAND_NAMES } from '../../main/startup/cli-command-names'
import { RuntimeClient } from '../runtime-client'
import { parseArgs, specPaths } from '../args'
afterEach(() => vi.restoreAllMocks())
it('registers both fixed Codex observers in public help, startup routing and lazy dispatch', async () => {
  for (const spec of CODEX_ACCOUNT_OBSERVE_COMMAND_SPECS) {
    expect(COMMAND_SPECS).toContain(spec)
    expect(HANDLER_COMMAND_KEYS.has(spec.path.join(' '))).toBe(true)
  }
  expect(CLI_COMMAND_NAMES).toContain('accounts')
  const parsed = parseArgs(
    ['accounts', 'observe-codex-stream', '--timeout', '250', '--json'],
    COMMAND_SPECS.flatMap(specPaths),
    COMMAND_SPECS
  )
  const client = new RuntimeClient('/fixture-no-runtime', 1000, null, null)
  const observe = vi
    .spyOn(client, 'observeCodexLogin')
    .mockImplementation(async (timeout, signal, emit) => {
      expect(timeout).toBe(250)
      expect(signal.aborted).toBe(false)
      emit({ type: 'ready', pending: false, revision: 0 })
      return 'timeout'
    })
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  await dispatch(parsed.commandPath, {
    client,
    cwd: '/fixture-no-runtime',
    flags: parsed.flags,
    json: true
  })
  expect(observe).toHaveBeenCalledOnce()
  expect(log).toHaveBeenCalledTimes(2)
  expect(JSON.parse(String(log.mock.calls[1]?.[0]))).toMatchObject({
    event: 'end',
    reason: 'timeout'
  })
})
