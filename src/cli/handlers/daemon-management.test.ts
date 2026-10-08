import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RuntimeClient } from '../runtime-client'
import { AGENT_SESSION_HANDLERS } from './agent-sessions'

let directory: string
const target = { sessionId: 'fixture', incarnationId: 'run-1', protocolVersion: 24, confirm: true }
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-cli-daemon-'))
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

async function run(command: string, request: unknown, result: unknown) {
  const client = new RuntimeClient(directory)
  const call = vi.spyOn(client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    result,
    _meta: { runtimeId: 'fixture-host' }
  })
  await writeFile(join(directory, 'request.json'), JSON.stringify(request))
  const handler = AGENT_SESSION_HANDLERS[command]
  if (!handler) {
    throw new Error('Missing daemon handler')
  }
  await handler({
    client,
    cwd: directory,
    json: true,
    flags: new Map([['request-file', 'request.json']])
  })
  return call
}

it('preserves the exact observed incarnation and confirmation in a stop request', async () => {
  const call = await run('terminal daemon stop', target, { target, verdict: { status: 'exited' } })
  expect(call).toHaveBeenCalledWith('daemon.sessions.stop', target)
})
it('requires explicit confirmation and rejects an execution-host override', async () => {
  await expect(run('terminal daemon stop', { ...target, confirm: false }, {})).rejects.toThrow(
    'Invalid'
  )
  await expect(
    run('terminal daemon stop', { ...target, executionHostId: 'other' }, {})
  ).rejects.toThrow('Invalid')
})
it.each(['live', 'unverifiable'])(
  'keeps an unconfirmed %s verdict in CLI error evidence',
  async (status) => {
    await expect(
      run('terminal daemon stop', target, { target, verdict: { status } })
    ).rejects.toMatchObject({
      code: 'daemon_stop_unconfirmed',
      data: { target, verdict: { status } }
    })
    expect(console.log).not.toHaveBeenCalled()
  }
)
it('does not report a partially confirmed batch as success', async () => {
  await expect(
    run(
      'terminal daemon stop-many',
      { targets: [target] },
      {
        results: [{ target, verdict: { status: 'unverifiable' } }]
      }
    )
  ).rejects.toMatchObject({ code: 'daemon_stop_unconfirmed' })
})
