import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { HandlerContext } from '../../src/cli/dispatch'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { WORKSPACE_JIRA_HANDLERS } from '../../src/cli/handlers/workspace-jira'
import { IssueUpdate } from '../../src/shared/rpc-contract/jira-params'
import { updateIssue } from '../../src/main/jira/jira-issue-mutations'

const fixture = vi.hoisted(() => ({ url: '' }))
vi.mock('../../src/main/jira/client', () => ({
  getClients: (siteId: string) => {
    expect(siteId).toBe('fixture')
    return [
      {
        site: {
          id: 'fixture',
          siteUrl: fixture.url,
          email: 'fixture@example.invalid',
          authType: 'server'
        },
        authorization: 'Bearer fixture-token'
      }
    ]
  },
  clearToken: () => {
    throw new Error('Fixture credentials must not be cleared')
  },
  isAuthError: () => false
}))
vi.mock('../../src/main/network/http-client', () => ({
  getMainHttpClient: () => ({ fetch: globalThis.fetch, proxySession: () => undefined })
}))
vi.mock('../../src/main/network/proxy-settings', () => ({
  ensureElectronProxyFromEnvironment: async () => {}
}))

let server: Server | undefined
let directory: string | undefined
afterEach(async () => {
  vi.restoreAllMocks()
  if (server) {
    await new Promise<void>((resolve, reject) =>
      server?.close((error) => (error ? reject(error) : resolve()))
    )
  }
  if (directory) {
    await rm(directory, { recursive: true, force: true })
  }
})

it('persists a Jira title through the existing service and an isolated HTTP provider', async () => {
  let title = 'before'
  let calls = 0
  let rejectUpdate = false
  server = createServer(async (request, response) => {
    expect(request.url).toBe('/rest/api/2/issue/TEST-1')
    expect(request.headers.authorization).toBe('Bearer fixture-token')
    if (request.method === 'PUT') {
      calls += 1
      if (rejectUpdate) {
        response.writeHead(400, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ errorMessages: ['fixture-token'] }))
        return
      }
      const chunks: Buffer[] = []
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk))
      }
      const body = z
        .object({ fields: z.object({ summary: z.string() }) })
        .parse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      title = body.fields.summary
      response.writeHead(204)
      response.end()
      return
    }
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ title }))
  })
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Fixture must have a loopback TCP port')
  }
  fixture.url = `http://127.0.0.1:${address.port}`
  directory = await mkdtemp(join(tmpdir(), 'orca-cli-jira-effect-'))
  const input = join(directory, 'input.json')
  await writeFile(
    input,
    JSON.stringify({ key: 'TEST-1', siteId: 'fixture', updates: { title: 'after CLI' } })
  )
  const client = new RuntimeClient(directory)
  vi.spyOn(client, 'call').mockImplementation(async (method, payload) => {
    expect(method).toBe('jira.updateIssue')
    const params = IssueUpdate.parse(payload)
    const result = await updateIssue(params.key, params.updates, params.siteId)
    return { id: 'fixture', ok: true, result, _meta: { runtimeId: 'isolated-fixture' } }
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const ctx: HandlerContext = {
    client,
    cwd: directory,
    json: true,
    flags: new Map([['params-file', input]])
  }
  await WORKSPACE_JIRA_HANDLERS['jira update-issue'](ctx)
  const response = await fetch(`${fixture.url}/rest/api/2/issue/TEST-1`, {
    headers: { Authorization: 'Bearer fixture-token' }
  })
  expect(await response.json()).toEqual({ title: 'after CLI' })
  rejectUpdate = true
  await expect(WORKSPACE_JIRA_HANDLERS['jira update-issue'](ctx)).rejects.toMatchObject({
    code: 'operation_failed'
  })
  expect(title).toBe('after CLI')
  expect(calls).toBe(2)
  expect(JSON.stringify(vi.mocked(console.log).mock.calls)).not.toContain('fixture-token')
})
