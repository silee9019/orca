import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { HandlerContext } from '../../src/cli/dispatch'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { WORKSPACE_LINEAR_DATA_HANDLERS } from '../../src/cli/handlers/workspace-linear-data'
import { CreateProject } from '../../src/shared/rpc-contract/linear-project-create-params'
import { createProject } from '../../src/main/linear/linear-project-queries'

const fixture = vi.hoisted(() => ({ url: '' }))
vi.mock('../../src/main/linear/client', () => ({
  getClients: (workspaceId: string) => {
    expect(workspaceId).toBe('workspace-1')
    return [
      {
        workspace: { id: workspaceId, organizationName: 'Fixture' },
        client: {
          client: {
            rawRequest: async (query: string, variables: unknown) => {
              const response = await fetch(fixture.url, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ query, variables })
              })
              if (!response.ok) {
                throw new Error(await response.text())
              }
              return response.json()
            }
          }
        }
      }
    ]
  },
  isAuthError: () => false
}))
vi.mock('../../src/main/linear/linear-token-store', () => ({
  clearToken: () => {
    throw new Error('Fixture credentials must not be changed')
  }
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

it('creates and reads back a Linear project through the existing service without persisting a rejected mutation', async () => {
  const projects: { id: string; name: string; content?: string; teamIds: string[] }[] = []
  let rejectNext = false
  server = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json')
    if (request.method === 'GET') {
      response.end(JSON.stringify(projects))
      return
    }
    const chunks: Buffer[] = []
    for await (const chunk of request) {
      chunks.push(Buffer.from(chunk))
    }
    const payload = z
      .object({
        query: z.string(),
        variables: z.object({ input: CreateProject.omit({ workspaceId: true }) })
      })
      .parse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
    expect(payload.query).toMatch(/projectCreate/)
    if (rejectNext) {
      response.statusCode = 400
      response.end('canary-token')
      return
    }
    const project = {
      id: 'project-1',
      name: payload.variables.input.name,
      content: payload.variables.input.content,
      teamIds: payload.variables.input.teamIds
    }
    projects.push(project)
    response.end(JSON.stringify({ data: { projectCreate: { success: true, project } } }))
  })
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Expected an isolated TCP provider')
  }
  fixture.url = `http://127.0.0.1:${address.port}`
  directory = await mkdtemp(join(tmpdir(), 'orca-cli-linear-project-'))
  const input = join(directory, 'input.json')
  await writeFile(
    input,
    JSON.stringify({
      workspaceId: 'workspace-1',
      name: 'Roadmap',
      teamIds: ['team-1'],
      content: 'Plan'
    })
  )
  const client = new RuntimeClient(directory)
  vi.spyOn(client, 'call').mockImplementation(async (method, payload) => {
    expect(method).toBe('linear.createProject')
    const { workspaceId, ...params } = CreateProject.parse(payload)
    return {
      id: 'fixture',
      ok: true,
      result: await createProject({ ...params, leadId: params.leadId ?? undefined }, workspaceId),
      _meta: { runtimeId: 'fixture' }
    }
  })
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  const ctx: HandlerContext = {
    client,
    cwd: directory,
    json: true,
    flags: new Map([
      ['params-file', input],
      ['confirm', 'workspace-1:Roadmap']
    ])
  }
  await WORKSPACE_LINEAR_DATA_HANDLERS['linear project create'](ctx)
  const readback = z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      content: z.string(),
      teamIds: z.array(z.string())
    })
  )
  expect(readback.parse(await (await fetch(fixture.url)).json())).toEqual([
    { id: 'project-1', name: 'Roadmap', content: 'Plan', teamIds: ['team-1'] }
  ])
  log.mockClear()
  rejectNext = true
  await expect(WORKSPACE_LINEAR_DATA_HANDLERS['linear project create'](ctx)).rejects.toMatchObject({
    code: 'operation_failed'
  })
  expect(projects).toHaveLength(1)
  expect(log).not.toHaveBeenCalled()
})
