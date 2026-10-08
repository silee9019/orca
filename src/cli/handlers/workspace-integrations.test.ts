import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RuntimeClient, RuntimeClientError } from '../runtime-client'
import type { HandlerContext } from '../dispatch'
import { WORKSPACE_BITBUCKET_HANDLERS } from './workspace-bitbucket'
import { WORKSPACE_INTEGRATION_HANDLERS } from './workspace-integrations'
let directory: string
let file: string
let ctx: HandlerContext
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-cli-integration-'))
  file = join(directory, 'secret.json')
  ctx = {
    client: new RuntimeClient(directory),
    cwd: directory,
    flags: new Map([['params-file', file]]),
    json: true
  }
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})
it('keeps a Linear API key out of success output and provider failure messages', async () => {
  const key = 'canary-api-key'
  await writeFile(file, JSON.stringify({ apiKey: key }))
  const call = vi.spyOn(ctx.client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    result: { ok: true, apiKey: key },
    _meta: { runtimeId: 'fixture' }
  })
  await WORKSPACE_INTEGRATION_HANDLERS['linear connect'](ctx)
  expect(call).toHaveBeenCalledWith('linear.connect', { apiKey: key })
  expect(console.log).toHaveBeenCalledWith(expect.not.stringContaining(key))
  call.mockRejectedValue(new RuntimeClientError('runtime_error', key))
  await expect(WORKSPACE_INTEGRATION_HANDLERS['linear connect'](ctx)).rejects.toThrow(
    'Connection failed'
  )
  await expect(WORKSPACE_INTEGRATION_HANDLERS['linear connect'](ctx)).rejects.not.toThrow(key)
})
it('reports rejected Jira credentials as failure without printing the provider payload', async () => {
  await writeFile(
    file,
    JSON.stringify({
      siteUrl: 'https://jira.invalid',
      apiToken: 'canary-token',
      email: 'fixture@example.invalid'
    })
  )
  vi.spyOn(ctx.client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    result: { ok: false, error: 'canary-token' },
    _meta: { runtimeId: 'fixture' }
  })
  await expect(WORKSPACE_INTEGRATION_HANDLERS['jira connect'](ctx)).rejects.toThrow(
    'Connection failed'
  )
  expect(console.log).not.toHaveBeenCalled()
})

it('rejects an aggregate workspace as a disconnect target before contacting the provider', async () => {
  await writeFile(file, JSON.stringify({ workspaceId: 'all' }))
  ctx.flags.set('confirm', 'all')
  const call = vi.spyOn(ctx.client, 'call')
  await expect(WORKSPACE_INTEGRATION_HANDLERS['linear disconnect'](ctx)).rejects.toMatchObject({
    code: 'invalid_argument'
  })
  expect(call).not.toHaveBeenCalled()
})

it.each(['jira test-connection', 'linear test-connection'])(
  'hides credential-bearing provider failure for %s',
  async (key) => {
    await writeFile(file, JSON.stringify({ workspaceId: 'workspace', siteId: 'site' }))
    vi.spyOn(ctx.client, 'call').mockResolvedValue({
      id: 'fixture',
      ok: true,
      result: { ok: false, error: 'canary-token' },
      _meta: { runtimeId: 'fixture' }
    })
    await expect(WORKSPACE_INTEGRATION_HANDLERS[key](ctx)).rejects.toThrow('Connection failed')
    expect(console.log).not.toHaveBeenCalled()
  }
)

it('validates Bitbucket token input and prints only the connection outcome', async () => {
  const call = vi.spyOn(ctx.client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    result: { ok: true, accessToken: 'canary-token' },
    _meta: { runtimeId: 'fixture' }
  })
  await writeFile(file, JSON.stringify({ authMode: 'token' }))
  await expect(WORKSPACE_BITBUCKET_HANDLERS['bitbucket connect'](ctx)).rejects.toThrow(
    'Invalid input'
  )
  expect(call).not.toHaveBeenCalled()
  await writeFile(file, JSON.stringify({ authMode: 'token', accessToken: 'canary-token' }))
  await WORKSPACE_BITBUCKET_HANDLERS['bitbucket connect'](ctx)
  expect(call).toHaveBeenCalledWith('bitbucket.connect', {
    authMode: 'token',
    accessToken: 'canary-token'
  })
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('canary-token')
})
it('confirms stored Bitbucket credential removal before contacting the selected host', async () => {
  const call = vi.spyOn(ctx.client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    result: { ok: true },
    _meta: { runtimeId: 'fixture' }
  })
  await expect(WORKSPACE_BITBUCKET_HANDLERS['bitbucket disconnect'](ctx)).rejects.toThrow(
    '--confirm'
  )
  expect(call).not.toHaveBeenCalled()
  ctx.flags.set('confirm', 'stored-bitbucket-credential')
  await WORKSPACE_BITBUCKET_HANDLERS['bitbucket disconnect'](ctx)
  expect(call).toHaveBeenCalledWith('bitbucket.disconnect')
})
