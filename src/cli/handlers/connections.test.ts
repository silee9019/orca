import { CONNECTIONS_VIEWER_HANDLERS } from './connections-viewer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RuntimeClient, RuntimeClientError } from '../runtime-client'
import type { HandlerContext } from '../dispatch'
import { SSH_HANDLERS } from './ssh'
import { ENVIRONMENT_CONNECTION_HANDLERS } from './environment-connections'
import { MOBILE_CONNECTION_HANDLERS } from './mobile-connections'

const directories: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  )
})
async function fixture(flags: [string, string | boolean][]): Promise<HandlerContext> {
  const directory = await mkdtemp(join(tmpdir(), 'orca-connections-cli-'))
  directories.push(directory)
  return {
    client: new RuntimeClient(directory, 1000, null, null),
    flags: new Map(flags),
    cwd: directory,
    json: true
  }
}

describe('connection CLI owner effects', () => {
  it('rejects destructive target mismatch before sending a request', async () => {
    const ctx = await fixture([
      ['target', 'host-a'],
      ['confirm-target', 'host-b']
    ])
    const call = vi.spyOn(ctx.client, 'call')
    await expect(SSH_HANDLERS['ssh terminate'](ctx)).rejects.toThrow('confirm_target_mismatch')
    expect(call).not.toHaveBeenCalled()
  })
  it('uses private JSON input for SSH creation and prints only the owner response', async () => {
    const ctx = await fixture([])
    const file = join(ctx.cwd, 'target.json')
    await writeFile(
      file,
      JSON.stringify({ label: 'fixture', host: 'private.example', username: 'me', port: 22 })
    )
    ctx.flags.set('input-file', file)
    const call = vi.spyOn(ctx.client, 'call').mockResolvedValue({
      id: 'fixture',
      ok: true,
      result: { target: { id: 'host-a', label: 'fixture' } },
      _meta: { runtimeId: 'fixture-runtime' }
    })
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    await SSH_HANDLERS['ssh target add'](ctx)
    expect(call).toHaveBeenCalledWith('ssh.management.addTarget', {
      target: { label: 'fixture', host: 'private.example', username: 'me', port: 22 }
    })
    expect(output.mock.calls.join('')).not.toContain('private.example')
  })
  it('verifies a pairing link through the runtime owner instead of directly saving it', async () => {
    const ctx = await fixture([['name', 'server']])
    const file = join(ctx.cwd, 'link.txt')
    await writeFile(file, 'fixture-private-pairing-link\n')
    ctx.flags.set('input-file', file)
    const call = vi.spyOn(ctx.client, 'call').mockResolvedValue({
      id: 'fixture',
      ok: true,
      result: { ok: false, kind: 'host-unreachable' },
      _meta: { runtimeId: 'fixture-runtime' }
    })
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    await expect(
      ENVIRONMENT_CONNECTION_HANDLERS['environment connection add'](ctx)
    ).rejects.toMatchObject({ code: 'connection_verification_failed' })
    expect(call).toHaveBeenCalledWith('environment.management.verifyAndAdd', {
      name: 'server',
      pairingCode: 'fixture-private-pairing-link',
      allowLoopback: false
    })
    expect(output.mock.calls.join('')).not.toContain('fixture-private-pairing-link')
  })
  it('writes pairing secrets only to an owner-only file and refuses to overwrite it before minting', async () => {
    const ctx = await fixture([['mode', 'local-only']])
    const file = join(ctx.cwd, 'pairing.json')
    ctx.flags.set('output-file', file)
    const call = vi.spyOn(ctx.client, 'call').mockResolvedValue({
      id: 'fixture',
      ok: true,
      result: { available: true, pairingUrl: 'fixture-secret-url' },
      _meta: { runtimeId: 'fixture-runtime' }
    })
    const output = vi.spyOn(console, 'log').mockImplementation(() => {})
    await MOBILE_CONNECTION_HANDLERS['mobile pairing create'](ctx)
    expect(await readFile(file, 'utf8')).toContain('fixture-secret-url')
    if (process.platform !== 'win32') {
      expect((await stat(file)).mode & 0o777).toBe(0o600)
    }
    expect(output.mock.calls.join('')).not.toContain('fixture-secret-url')
    await expect(MOBILE_CONNECTION_HANDLERS['mobile pairing create'](ctx)).rejects.toMatchObject({
      code: 'EEXIST'
    })
    expect(call).toHaveBeenCalledTimes(1)
  })
  it('deletes its reserved output file when pairing fails', async () => {
    const ctx = await fixture([['mode', 'automatic']])
    const file = join(ctx.cwd, 'pairing.json')
    ctx.flags.set('output-file', file)
    vi.spyOn(ctx.client, 'call').mockRejectedValue(
      new RuntimeClientError('sign_in_required', 'Sign in')
    )
    await expect(MOBILE_CONNECTION_HANDLERS['mobile pairing create'](ctx)).rejects.toThrow(
      'Sign in'
    )
    await expect(stat(file)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

it('does not echo a secret used as an invalid SSH enum value', async () => {
  const ctx = await fixture([])
  const file = join(ctx.cwd, 'target.json')
  const secret = 'fixture-secret-enum-canary'
  await writeFile(
    file,
    JSON.stringify({
      label: 'fixture',
      host: 'private.example',
      username: 'me',
      port: 22,
      remoteRuntime: secret
    })
  )
  ctx.flags.set('input-file', file)
  const call = vi.spyOn(ctx.client, 'call')
  let failure: unknown
  try {
    await SSH_HANDLERS['ssh target add'](ctx)
  } catch (error) {
    failure = error
  }
  expect(failure).toBeInstanceOf(RuntimeClientError)
  expect(String(failure)).not.toContain(secret)
  expect(call).not.toHaveBeenCalled()
})

it('does not echo an unknown JSON key from private input', async () => {
  const ctx = await fixture([])
  const file = join(ctx.cwd, 'target.json')
  const secret = 'fixture-secret-unknown-key-canary'
  await writeFile(
    file,
    JSON.stringify({ label: 'fixture', host: 'host', username: 'me', port: 22, [secret]: true })
  )
  ctx.flags.set('input-file', file)
  let failure: unknown
  try {
    await SSH_HANDLERS['ssh target add'](ctx)
  } catch (error) {
    failure = error
  }
  expect(failure).toBeInstanceOf(RuntimeClientError)
  expect(String(failure)).not.toContain(secret)
})

it('rejects a retargeted environment connection query instead of answering from local state', async () => {
  const ctx = await fixture([['environment', 'other-host']])
  const call = vi.spyOn(ctx.client, 'call')
  await expect(
    ENVIRONMENT_CONNECTION_HANDLERS['environment connection status'](ctx)
  ).rejects.toMatchObject({ code: 'invalid_argument' })
  expect(call).not.toHaveBeenCalled()
})

it('sends private viewer drafts only to the explicit viewer and prints only its ack', async () => {
  const ctx = await fixture([['viewer', '42']])
  const file = join(ctx.cwd, 'viewer.json')
  const secret = 'private-viewer-pairing-canary'
  await writeFile(file, JSON.stringify({ operation: 'runtime.draft-pairing', value: secret }))
  ctx.flags.set('input-file', file)
  const call = vi.spyOn(ctx.client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    result: { viewerId: 42, applied: true, persisted: null },
    _meta: { runtimeId: 'fixture' }
  })
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  await CONNECTIONS_VIEWER_HANDLERS['connections viewer'](ctx)
  expect(call).toHaveBeenCalledWith('connections.viewer.apply', {
    viewerId: 42,
    operation: 'runtime.draft-pairing',
    value: secret
  })
  expect(output.mock.calls.join('')).not.toContain(secret)
})
it('rejects malformed private viewer actions without echoing their values', async () => {
  const ctx = await fixture([['viewer', '42']])
  const file = join(ctx.cwd, 'viewer.json')
  const secret = 'private-viewer-operation-canary'
  await writeFile(file, JSON.stringify({ operation: secret }))
  ctx.flags.set('input-file', file)
  const call = vi.spyOn(ctx.client, 'call')
  let failure: unknown
  try {
    await CONNECTIONS_VIEWER_HANDLERS['connections viewer'](ctx)
  } catch (error) {
    failure = error
  }
  expect(failure).toBeInstanceOf(RuntimeClientError)
  expect(String(failure)).not.toContain(secret)
  expect(call).not.toHaveBeenCalled()
})

it('prepares browser placement for the explicit saved server and refuses retargeting before requests', async () => {
  const ctx = await fixture([
    ['server', 'remote-a'],
    ['preference', 'server'],
    ['pairing-revision', '7']
  ])
  const call = vi.spyOn(ctx.client, 'call').mockResolvedValue({
    id: 'fixture',
    ok: true,
    result: { kind: 'server' },
    _meta: { runtimeId: 'remote-runtime' }
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  await ENVIRONMENT_CONNECTION_HANDLERS['environment connection browser-placement'](ctx)
  expect(call).toHaveBeenCalledWith('environment.management.prepareBrowserPlacement', {
    selector: 'remote-a',
    preference: 'server',
    expectedPairingRevision: 7
  })
  call.mockClear()
  ctx.flags.set('environment', 'wrong-host')
  await expect(
    ENVIRONMENT_CONNECTION_HANDLERS['environment connection browser-placement'](ctx)
  ).rejects.toMatchObject({ code: 'invalid_argument' })
  expect(call).not.toHaveBeenCalled()
})
