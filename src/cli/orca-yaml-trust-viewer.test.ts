import { afterEach, expect, it, vi } from 'vitest'
import { normalizeCommandPositionals, parseArgs } from './args'
import { dispatch } from './dispatch'
import { COMMAND_SPECS } from './specs'
import { RuntimeClient, RuntimeClientError } from './runtime-client'
import { OrcaYamlTrustViewerResultSchema } from '../shared/orca-yaml-trust-viewer-command'

const client = new RuntimeClient('/unused')
const call = vi.spyOn(client, 'call')
const output = vi.spyOn(console, 'log').mockImplementation(() => {})
const prompt = {
  repoId: 'repo-1',
  repoName: 'orca',
  scriptKind: 'setup',
  previouslyApproved: false,
  contentHash: 'hash-1'
}
const result = {
  viewer: 'host',
  viewerId: 7,
  dispatched: true,
  applied: true,
  writeOutcome: 'not_requested',
  decision: 'skip',
  prompt,
  open: false,
  rendered: { runtimeContextKey: 'local#0', open: false, prompt: null }
}
const run = (args: string[]) => {
  const parsed = parseArgs(
    ['ui', 'orca-yaml-trust', ...args, '--viewer', 'host', '--json'],
    COMMAND_SPECS.map((s) => s.path),
    COMMAND_SPECS
  )
  // Why: the entry point canonicalizes aliases before dispatch.
  const { commandPath, flags } = normalizeCommandPositionals(COMMAND_SPECS, parsed)
  return dispatch(commandPath, { client, flags, cwd: '/unused', json: true })
}
afterEach(() => {
  call.mockReset()
  output.mockClear()
})

it('routes get and skip through the public parser with explicit options', async () => {
  call.mockResolvedValue({ id: 'r', ok: true, _meta: { runtimeId: 'host' }, result })
  const cases: [string[], Record<string, unknown>][] = [
    [['get'], { operation: 'get' }],
    [['show'], { operation: 'get' }],
    [['skip'], { operation: 'skip' }],
    [
      ['skip', '--repo', 'repo-1', '--script-kind', 'setup'],
      { operation: 'skip', repoId: 'repo-1', scriptKind: 'setup' }
    ]
  ]
  for (const [args, params] of cases) {
    await run(args)
    expect(call).toHaveBeenLastCalledWith('ui.orcaYamlTrustViewer', { viewer: 'host', ...params })
    expect(JSON.parse(output.mock.calls.at(-1)?.[0])).toMatchObject({ result: { viewerId: 7 } })
  }
})
it('rejects an unknown, empty or repeated guard before any RPC', async () => {
  for (const args of [
    ['skip', '--script-kind', 'nope'],
    ['skip', '--repo', ''],
    ['skip', '--repo='],
    ['skip', '--repo'],
    ['skip', '--script-kind', ''],
    ['skip', '--repo', 'a', '--repo', 'b'],
    ['get', '--repo', 'repo-1']
  ]) {
    await expect(run(args)).rejects.toThrow()
  }
  expect(call).not.toHaveBeenCalled()
})
it('prints only the fields the contract names, never script text', async () => {
  call.mockResolvedValue({
    id: 'r',
    ok: true,
    _meta: { runtimeId: 'host' },
    result: {
      ...result,
      prompt: { ...prompt, scriptContent: 'SECRET_SCRIPT_TEXT' },
      rendered: { ...result.rendered, scriptContent: 'SECRET_SCRIPT_TEXT' }
    }
  })
  await run(['get'])
  expect(output.mock.calls.at(-1)?.[0]).not.toContain('SECRET_SCRIPT_TEXT')
})
it('has no command that runs the script or trusts a repository', () => {
  const paths = COMMAND_SPECS.map((spec) => spec.path.join(' ')).filter((path) =>
    path.startsWith('ui orca-yaml-trust')
  )
  expect(paths.sort()).toEqual(['ui orca-yaml-trust get', 'ui orca-yaml-trust skip'])
})
it('tells an older runtime to update, for a missing method or an unknown operation', async () => {
  for (const code of ['method_not_found', 'invalid_argument']) {
    call.mockRejectedValueOnce(new RuntimeClientError(code, 'old'))
    await expect(run(['skip'])).rejects.toMatchObject({
      code: 'incompatible_runtime',
      message: expect.stringContaining('Update the target runtime')
    })
  }
})
it('passes a host rejection of get through instead of calling the runtime old', async () => {
  call.mockRejectedValueOnce(new RuntimeClientError('invalid_argument', 'bad'))
  await expect(run(['get'])).rejects.toMatchObject({ code: 'invalid_argument', message: 'bad' })
})
it('keeps future outcomes safe and rejects malformed identity', () => {
  expect(
    OrcaYamlTrustViewerResultSchema.parse({
      ...result,
      writeOutcome: 'future',
      decision: 'run',
      reason: 'future'
    })
  ).toMatchObject({
    writeOutcome: 'unknown',
    decision: 'run',
    reason: 'orca_yaml_trust_still_open'
  })
  expect(OrcaYamlTrustViewerResultSchema.safeParse({ ...result, viewerId: '7' }).success).toBe(
    false
  )
})
