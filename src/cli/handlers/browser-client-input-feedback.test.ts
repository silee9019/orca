import { tmpdir } from 'node:os'
import { afterEach, expect, it, vi } from 'vitest'
import { RuntimeClient, RuntimeRpcFailureError } from '../runtime-client'
import { parseArgs, validateCommandAndFlags } from '../args'
import { BROWSER_CLIENT_INPUT_FEEDBACK_COMMAND_SPECS } from '../specs/browser-client-input-feedback'
import { BROWSER_CLIENT_INPUT_FEEDBACK_HANDLERS } from './browser-client-input-feedback'
const client = new RuntimeClient(tmpdir())
const target = {
  worktreeId: 'folder:fixture',
  page: 'page',
  environmentId: 'paired',
  remotePageId: 'remote',
  browserHostClientId: 'desktop',
  browserHostGeneration: 3,
  pageHostGeneration: 4
}
const state = {
  source: { kind: 'materialized', target },
  inputRejected: true,
  kind: 'invalid',
  loadErrorCode: 0,
  navigationStarted: false
}
afterEach(() => vi.restoreAllMocks())
async function run() {
  const specs = BROWSER_CLIENT_INPUT_FEEDBACK_COMMAND_SPECS
  const parsed = parseArgs(
    [
      'browser',
      'client-input-feedback',
      '--viewer',
      'host',
      '--value',
      'javascript:fixture',
      '--worktree',
      target.worktreeId,
      '--page',
      target.page,
      '--runtime-environment',
      target.environmentId,
      '--remote-page',
      target.remotePageId,
      '--browser-client',
      target.browserHostClientId,
      '--browser-host-generation',
      '3',
      '--page-host-generation',
      '4'
    ],
    specs.map((spec) => spec.path),
    specs
  )
  validateCommandAndFlags(specs, parsed)
  await BROWSER_CLIENT_INPUT_FEEDBACK_HANDLERS['browser client-input-feedback']({
    ...parsed,
    client,
    cwd: '.',
    json: true
  })
}
it.each([
  undefined,
  null,
  {},
  { applied: true, clientInputFeedback: { ...state, navigationStarted: true } },
  {
    applied: true,
    clientInputFeedback: {
      ...state,
      source: { kind: 'materialized', target: { ...target, pageHostGeneration: 5 } }
    }
  }
])('rejects malformed or mismatched public feedback %#', async (result) => {
  vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: { runtimeId: 'fixture' },
    result
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await expect(run()).rejects.toMatchObject({ code: 'runtime_error' })
  expect(output).not.toHaveBeenCalled()
})
it('strips raw input, private path and metadata from the public receipt', async () => {
  const meta = { runtimeId: 'fixture', private: 'PRIVATE' }
  vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    _meta: meta,
    result: {
      applied: true,
      private: 'PRIVATE',
      clientInputFeedback: { ...state, value: 'PRIVATE', validatedUrl: 'PRIVATE', path: 'PRIVATE' }
    }
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await run()
  expect(output.mock.lastCall?.[0]).toContain('"inputRejected": true')
  expect(output.mock.lastCall?.[0]).not.toContain('PRIVATE')
})
it('fails closed against an old peer without another operation', async () => {
  const call = vi.spyOn(client, 'call').mockRejectedValue(
    new RuntimeRpcFailureError({
      id: 'fixture',
      ok: false,
      _meta: { runtimeId: 'fixture' },
      error: { code: 'invalid_params', message: 'unsupported' }
    })
  )
  await expect(run()).rejects.toMatchObject({ code: 'incompatible_runtime' })
  expect(call).toHaveBeenCalledTimes(1)
})
