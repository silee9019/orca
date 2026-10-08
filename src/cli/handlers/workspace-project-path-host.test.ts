import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { RuntimeClient, RuntimeClientError } from '../runtime-client'
import type { HandlerContext } from '../dispatch'
import { PROJECT_HANDLERS } from './project'

vi.mock('../runtime/environments', () => ({ listEnvironments: () => [] }))
let directory: string
let ctx: HandlerContext
let hostId: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-cli-project-path-'))
  hostId = 'ssh:fixture'
  const client = new RuntimeClient(directory)
  ctx = {
    client,
    cwd: directory,
    json: true,
    flags: new Map([
      ['project', 'project'],
      ['host', hostId],
      ['setup', 'setup']
    ])
  }
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(client, 'call').mockImplementation(async (method, params) => {
    let result: unknown
    switch (method) {
      case 'ssh.listTargetSummaries':
        result = {
          targets: [
            { id: 'fixture', label: 'fixture', host: 'fixture.invalid', username: 'fixture' }
          ]
        }
        break
      case 'projectHostSetup.list':
        result = { setups: [{ id: 'setup', hostId }] }
        break
      case 'projectHostSetup.create':
      case 'projectHostSetup.update':
      case 'projectHostSetup.clone':
        await writeFile(join(directory, 'effect.json'), JSON.stringify(params))
        result = { result: {} }
        break
      default:
        throw new Error(`Unexpected fixture method: ${method}`)
    }
    return { id: 'fixture', ok: true, result, _meta: { runtimeId: 'isolated-fixture' } }
  })
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

it('rejects relative SSH metadata paths before creating or updating a setup', async () => {
  ctx.flags.set('path', './wrong-host')
  for (const command of ['project setup-create', 'project setup-update']) {
    await expect(PROJECT_HANDLERS[command](ctx)).rejects.toMatchObject({ code: 'invalid_argument' })
  }
  await expect(readFile(join(directory, 'effect.json'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('preserves a Windows path on the SSH host when creating and updating metadata from another OS', async () => {
  const path = 'C:\\remote\\repo'
  ctx.flags.set('path', path)
  await PROJECT_HANDLERS['project setup-create'](ctx)
  expect(JSON.parse(await readFile(join(directory, 'effect.json'), 'utf8'))).toMatchObject({
    hostId,
    path
  })
  await PROJECT_HANDLERS['project setup-update'](ctx)
  expect(JSON.parse(await readFile(join(directory, 'effect.json'), 'utf8'))).toMatchObject({
    updates: { path }
  })
})

it('keeps relative paths on the client for local metadata and skips the host lookup without a path', async () => {
  hostId = 'local'
  ctx.flags.set('host', hostId)
  ctx.flags.set('path', './local-repo')
  for (const command of ['project setup-create', 'project setup-update']) {
    await PROJECT_HANDLERS[command](ctx)
    const effect = JSON.parse(await readFile(join(directory, 'effect.json'), 'utf8'))
    expect(command === 'project setup-create' ? effect.path : effect.updates.path).toBe(
      resolve(directory, './local-repo')
    )
  }
  const call = vi.mocked(ctx.client.call)
  call.mockClear()
  ctx.flags.delete('path')
  await PROJECT_HANDLERS['project setup-update'](ctx)
  expect(call).toHaveBeenCalledTimes(1)
  expect(call).toHaveBeenCalledWith('projectHostSetup.update', expect.anything())
})

it('refuses a path update when the setup is absent or the peer cannot identify its host', async () => {
  ctx.flags.set('path', './relative')
  const call = vi.mocked(ctx.client.call)
  call.mockResolvedValueOnce({
    id: 'fixture',
    ok: true,
    result: { setups: [] },
    _meta: { runtimeId: 'fixture' }
  })
  await expect(PROJECT_HANDLERS['project setup-update'](ctx)).rejects.toThrow('not found')
  call.mockRejectedValueOnce(new RuntimeClientError('method_not_found', 'old peer'))
  await expect(PROJECT_HANDLERS['project setup-update'](ctx)).rejects.toMatchObject({
    code: 'incompatible_runtime'
  })
  expect(call).toHaveBeenCalledTimes(2)
  await expect(readFile(join(directory, 'effect.json'))).rejects.toMatchObject({ code: 'ENOENT' })
})
