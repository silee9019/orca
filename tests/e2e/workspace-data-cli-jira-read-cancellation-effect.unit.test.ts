import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createServer, type Server, type ServerResponse } from 'node:http'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { directory, store, ctx } from './workspace-data-cli-remote-clone-fixture'
import { WORKSPACE_JIRA_READ_HANDLERS } from '../../src/cli/handlers/workspace-jira-reads'
import {
  WORKSPACE_JIRA_READ_METHODS,
  disposeJiraCliReads
} from '../../src/main/runtime/rpc/methods/workspace-jira-reads'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClientError } from '../../src/cli/runtime-client'
import {
  JiraCliReadRequest,
  JiraCliSearchStart,
  JiraCliSummaryStart
} from '../../src/shared/rpc-contract/workspace-jira-read-params'

const provider = vi.hoisted(() => ({ url: '' }))
vi.mock('../../src/main/jira/client', () => ({
  getClients: (siteId: string) => {
    expect(siteId).toBe('fixture')
    return [
      {
        site: {
          id: 'fixture',
          siteUrl: provider.url,
          email: 'fixture@example.invalid',
          authType: 'server'
        },
        authorization: 'Bearer fixture-token'
      }
    ]
  },
  clearToken: () => {
    throw new Error('Private credentials must not be cleared')
  },
  isAuthError: () => false
}))
vi.mock('../../src/main/network/http-client', () => ({
  getMainHttpClient: () => ({ fetch: globalThis.fetch, proxySession: () => undefined })
}))
vi.mock('../../src/main/network/proxy-settings', () => ({
  ensureElectronProxyFromEnvironment: async () => {}
}))
let server: Server
let pending: ServerResponse[]
let closed: number
let respond: boolean
const issue = { id: '1', key: 'TEST-1', fields: { summary: 'Private Jira fixture', labels: [] } }
async function invoke(kind: string, action: string, params: object) {
  const input = join(directory, 'jira-read.json')
  await writeFile(input, JSON.stringify(params))
  ctx.flags = new Map([['params-file', input]])
  await WORKSPACE_JIRA_READ_HANDLERS[`jira ${kind}-${action}`](ctx)
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
function start(kind: string) {
  return invoke(
    kind,
    'start',
    kind === 'search'
      ? { jql: 'project=TEST', siteId: 'fixture', limit: 2 }
      : { key: 'TEST-1', siteId: 'fixture' }
  )
}
beforeEach(async () => {
  pending = []
  closed = 0
  respond = false
  server = createServer(async (request, response) => {
    expect(request.headers.authorization).toBe('Bearer fixture-token')
    expect(request.url?.startsWith('/rest/api/2/')).toBe(true)
    if (request.method === 'POST') {
      const chunks: Buffer[] = []
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk))
      }
      expect(JSON.parse(Buffer.concat(chunks).toString())).toMatchObject({
        jql: 'project=TEST',
        maxResults: 2
      })
    }
    response.once('close', () => {
      closed++
    })
    if (respond) {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify(request.method === 'POST' ? { issues: [issue] } : issue))
    } else {
      pending.push(response)
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Fixture requires a private loopback port')
  }
  provider.url = `http://127.0.0.1:${address.port}`
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(store),
    methods: WORKSPACE_JIRA_READ_METHODS
  })
  vi.mocked(ctx.client.call).mockImplementation(async (method, params) => {
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
})
afterEach(async () => {
  disposeJiraCliReads()
  for (const response of pending) {
    response.destroy()
  }
  server.closeAllConnections()
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  )
})
it.each(['search', 'summary'])(
  'cancels only a CLI-owned %s through the original runtime/service HTTP request',
  async (kind) => {
    const request = await start(kind)
    await vi.waitFor(() => expect(pending).toHaveLength(1))
    await expect(
      invoke(kind === 'search' ? 'summary' : 'search', 'cancel', { requestId: request.requestId })
    ).rejects.toThrow('selector_not_found')
    await expect(
      invoke(kind, 'cancel', { requestId: '00000000-0000-4000-8000-000000000001' })
    ).rejects.toThrow('selector_not_found')
    expect(pending[0]?.destroyed).toBe(false)
    expect((await invoke(kind, 'cancel', { requestId: request.requestId })).state).toBe(
      'cancel_requested'
    )
    await vi.waitFor(async () =>
      expect((await invoke(kind, 'status', { requestId: request.requestId })).state).toBe(
        'cancelled'
      )
    )
    await vi.waitFor(() => expect(closed).toBe(1))
    expect((await invoke(kind, 'status', { requestId: request.requestId })).result).toBeUndefined()
    expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('fixture-token')
  }
)
it.each(['search', 'summary'])(
  'returns original mapped %s results and preserves completed state when cancelled afterwards',
  async (kind) => {
    respond = true
    const request = await start(kind)
    await vi.waitFor(async () =>
      expect((await invoke(kind, 'status', { requestId: request.requestId })).state).toBe(
        'completed'
      )
    )
    const result = await invoke(kind, 'cancel', { requestId: request.requestId })
    expect(result.state).toBe('completed')
    expect(kind === 'search' ? result.result[0] : result.result).toMatchObject({
      key: 'TEST-1',
      title: 'Private Jira fixture',
      siteId: 'fixture'
    })
  }
)
it('rejects input before RPC and preserves old-peer failure for all six commands', async () => {
  expect(JiraCliSearchStart.safeParse({ jql: 'a', limit: 101 }).success).toBe(false)
  expect(JiraCliSummaryStart.safeParse({ key: 'TEST-1' }).success).toBe(false)
  expect(JiraCliReadRequest.safeParse({ requestId: 'renderer' }).success).toBe(false)
  vi.mocked(ctx.client.call).mockClear()
  await expect(invoke('search', 'start', { jql: 'a', requestId: 'renderer' })).rejects.toThrow()
  expect(ctx.client.call).not.toHaveBeenCalled()
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  for (const kind of ['search', 'summary']) {
    await expect(start(kind)).rejects.toMatchObject({ code: 'method_not_found' })
    for (const action of ['status', 'cancel']) {
      await expect(
        invoke(kind, action, { requestId: '00000000-0000-4000-8000-000000000001' })
      ).rejects.toMatchObject({ code: 'method_not_found' })
    }
  }
})
