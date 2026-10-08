import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import http from 'node:http'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { ipcMain } from 'electron'
import type { HandlerContext } from '../../src/cli/dispatch'
const fixture = vi.hoisted(() => ({ scan: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
vi.mock('../../src/main/ssh/ssh-config-parser', () => ({
  loadUserSshConfig: () => ({ hosts: [] }),
  sshConfigHostsToTargets: () => []
}))
vi.mock('../../src/main/ports/workspace-port-ownership', () => ({
  getStoreWorkspacePortProbes: () => [],
  scanWorkspacePortProbes: fixture.scan
}))
import * as appEnvironment from '../../src/shared/app-environment'
import { Store } from '../../src/main/persistence'
import { ProfileStateSqliteAuthority } from '../../src/main/persistence/profile-state/profile-state-sqlite-authority'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { registerLocalhostWorktreeLabelHandlers } from '../../src/main/ipc/localhost-worktree-labels'
import {
  WORKSPACE_LOCALHOST_LABEL_METHODS,
  setDesktopLocalhostLabelForRpc
} from '../../src/main/runtime/rpc/methods/workspace-localhost-label'
import { WORKSPACE_LOCALHOST_LABEL_HANDLERS } from '../../src/cli/handlers/workspace-localhost-label'
let directory: string
let store: Store
let authority: ProfileStateSqliteAuthority
const servers: http.Server[] = []
afterEach(async () => {
  setDesktopLocalhostLabelForRpc(null)
  const ownedServers = servers.splice(0)
  await Promise.all(
    ownedServers.map((server) => new Promise<void>((resolve) => server.close(() => resolve())))
  )
  expect(ownedServers.every((server) => !server.listening)).toBe(true)
  await store?.freezeWritesAsync()
  authority?.close()
  vi.restoreAllMocks()
  if (directory) {
    await rm(directory, { recursive: true, force: true })
  }
})
it('registers through the original security policy, actually forwards HTTP and closes only fixture servers', async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-cli-localhost-label-'))
  vi.spyOn(appEnvironment, 'getAppEnvironment').mockReturnValue({
    getPath: () => directory,
    getAppPath: () => directory,
    getVersion: () => 'fixture',
    isPackaged: () => false,
    onWillQuit: () => {},
    exit: () => {},
    getAppMetrics: () => []
  })
  authority = new ProfileStateSqliteAuthority(join(directory, 'profile.db'), 'fixture')
  vi.spyOn(authority, 'scheduleBackup').mockImplementation(() => {})
  store = new Store({ dataFile: join(directory, 'data.json'), profileStateAuthority: authority })
  const upstream = http.createServer((request, response) => {
    response.writeHead(200, { 'x-fixture': 'upstream' })
    response.end(`fixture:${request.url}`)
  })
  servers.push(upstream)
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
  const address = upstream.address()
  if (!address || typeof address === 'string') {
    throw new Error('Missing upstream address')
  }
  const targetUrl = `http://127.0.0.1:${address.port}/fixture`
  fixture.scan.mockResolvedValue({ ports: [] })
  const created = vi.spyOn(http, 'createServer')
  registerLocalhostWorktreeLabelHandlers(store)
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(store),
    methods: WORKSPACE_LOCALHOST_LABEL_METHODS
  })
  const client = new RuntimeClient('different-client-profile')
  vi.spyOn(client, 'call').mockImplementation(async (method, params) => {
    const response = await dispatcher.dispatch({
      id: 'fixture',
      authToken: 'fixture',
      method,
      params
    })
    if (!response.ok) {
      throw new RuntimeClientError(response.error.code, response.error.message)
    }
    return response
  })
  const ctx: HandlerContext = { client, cwd: directory, json: true, flags: new Map() }
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const params = {
    targetUrl,
    projectName: 'Fixture',
    worktreeName: 'Branch',
    repoId: 'fixture',
    worktreeId: 'fixture::branch',
    expectedExecutionHostId: 'local'
  }
  async function invoke(value: object, confirm = targetUrl) {
    const input = join(directory, 'params.json')
    await writeFile(input, JSON.stringify(value))
    ctx.flags.set('params-file', input)
    ctx.flags.set('confirm', confirm)
    await WORKSPACE_LOCALHOST_LABEL_HANDLERS['workspace-ports register-localhost-label'](ctx)
    const text = vi.mocked(console.log).mock.calls.at(-1)?.[0]
    if (typeof text !== 'string') {
      throw new Error('Missing fixture result')
    }
    return JSON.parse(text).result
  }
  let labeled: { url: string; label: string }
  try {
    labeled = await invoke(params)
  } finally {
    for (const result of created.mock.results) {
      if (result.type === 'return') {
        servers.push(result.value)
      }
    }
  }
  expect(created).toHaveBeenCalledOnce()
  const again = await invoke(params)
  expect(again).toEqual(labeled)
  const url = new URL(labeled.url)
  expect(url.hostname).toMatch(/\.orca\.localhost$/)
  const received = await new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = http.get(
      {
        host: '127.0.0.1',
        port: Number(url.port),
        path: url.pathname,
        headers: { host: url.host },
        agent: false
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8')
          })
        )
        response.on('error', reject)
      }
    )
    request.on('error', reject)
  })
  expect(received).toEqual({ status: 200, body: 'fixture:/fixture' })
  const callback = vi
    .mocked(ipcMain.handle)
    .mock.calls.find(([channel]) => channel === 'localhostWorktreeLabels:register')?.[1]
  if (!callback) {
    throw new Error('Missing original IPC callback')
  }
  expect(await Reflect.apply(callback, undefined, [undefined, params])).toEqual(labeled)
  await expect(invoke(params, 'wrong')).rejects.toThrow()
  await expect(invoke({ ...params, expectedExecutionHostId: 'ssh:fixture' })).rejects.toThrow()
  await expect(
    invoke(
      { ...params, targetUrl: 'http://forbidden.invalid:8123' },
      'http://forbidden.invalid:8123'
    )
  ).rejects.toThrow()
  expect(fixture.scan).toHaveBeenCalledWith([], { requireMetadata: true })
  fixture.scan.mockResolvedValue({
    ports: [{ port: address.port, connectHost: 'fixture.invalid' }]
  })
  const advertised = `http://fixture.invalid:${address.port}/fixture`
  const allowed = await invoke({ ...params, targetUrl: advertised }, advertised)
  expect(new URL(allowed.url).port).toBe(url.port)
  const before = vi.mocked(client.call).mock.calls.length
  for (const target of [
    'http://user:password@127.0.0.1:8123',
    'http://127.0.0.1:8123/?token=secret',
    'https://127.0.0.1:8123'
  ]) {
    await expect(invoke({ ...params, targetUrl: target }, target)).rejects.toThrow()
  }
  expect(vi.mocked(client.call).mock.calls.length).toBe(before)
  setDesktopLocalhostLabelForRpc(null)
  await expect(invoke(params)).rejects.toMatchObject({ code: 'runtime_unavailable' })
  vi.mocked(client.call).mockRejectedValue(new RuntimeClientError('method_not_found', 'Old peer'))
  await expect(invoke(params)).rejects.toMatchObject({ code: 'method_not_found' })
  await store.flushAsync()
})
