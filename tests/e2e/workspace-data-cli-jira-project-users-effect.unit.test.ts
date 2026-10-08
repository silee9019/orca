import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../../src/cli/dispatch'
import { WORKSPACE_JIRA_HANDLERS } from '../../src/cli/handlers/workspace-jira'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { listAssignableUsersForProject } from '../../src/main/jira/jira-issue-create-metadata'
import type * as JiraMetadata from '../../src/main/jira/jira-issue-create-metadata'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { WORKSPACE_JIRA_PROJECT_USER_METHODS } from '../../src/main/runtime/rpc/methods/workspace-jira-project-users'

vi.mock('../../src/main/jira/jira-issue-create-metadata', async (original) => ({
  ...(await original<typeof JiraMetadata>()),
  listAssignableUsersForProject: vi.fn()
}))

let directory: string
let input: string
let output: string
let ctx: HandlerContext
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-cli-jira-project-users-'))
  input = join(directory, 'input.json')
  output = join(directory, 'host-query.json')
  vi.mocked(listAssignableUsersForProject).mockImplementation(
    async (projectIdOrKey, query, siteId) => {
      await writeFile(output, JSON.stringify({ projectIdOrKey, query, siteId }))
      return []
    }
  )
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(),
    methods: WORKSPACE_JIRA_PROJECT_USER_METHODS
  })
  const client = new RuntimeClient(join(directory, 'client-home'))
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
  ctx = { client, cwd: directory, json: true, flags: new Map([['params-file', input]]) }
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(async () => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  await rm(directory, { recursive: true, force: true })
})

it('queries the selected runtime project rather than the issue-key endpoint', async () => {
  await writeFile(
    input,
    JSON.stringify({ projectIdOrKey: ' PROJECT ', query: ' Alice ', siteId: 'host-site' })
  )
  await WORKSPACE_JIRA_HANDLERS['jira list-project-assignable-users'](ctx)
  expect(JSON.parse(await readFile(output, 'utf8'))).toEqual({
    projectIdOrKey: 'PROJECT',
    query: ' Alice ',
    siteId: 'host-site'
  })
  expect(ctx.client.call).toHaveBeenCalledExactlyOnceWith('jira.listAssignableUsersForProject', {
    projectIdOrKey: 'PROJECT',
    query: ' Alice ',
    siteId: 'host-site'
  })
  expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"result": []'))
})

it('rejects an empty project before RPC and fails on an old peer without fallback', async () => {
  await writeFile(input, JSON.stringify({ projectIdOrKey: '  ' }))
  await expect(
    WORKSPACE_JIRA_HANDLERS['jira list-project-assignable-users'](ctx)
  ).rejects.toMatchObject({ code: 'invalid_argument' })
  expect(ctx.client.call).not.toHaveBeenCalled()
  await writeFile(input, JSON.stringify({ projectIdOrKey: 'PROJECT' }))
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'old host')
  )
  await expect(
    WORKSPACE_JIRA_HANDLERS['jira list-project-assignable-users'](ctx)
  ).rejects.toMatchObject({ code: 'method_not_found' })
  expect(ctx.client.call).toHaveBeenCalledTimes(1)
  expect(listAssignableUsersForProject).not.toHaveBeenCalled()
  await expect(readFile(output)).rejects.toMatchObject({ code: 'ENOENT' })
})
