import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../../src/cli/dispatch'
import { RuntimeClient, RuntimeClientError } from '../../src/cli/runtime-client'
import { WORKSPACE_GITLAB_INSPECTION_HANDLERS } from '../../src/cli/handlers/workspace-gitlab-inspection'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { WORKSPACE_GITLAB_INSPECTION_METHODS } from '../../src/main/runtime/rpc/methods/workspace-gitlab-inspection'

let directory: string
let input: string
let output: string
let ctx: HandlerContext
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-cli-gitlab-inspection-'))
  input = join(directory, 'input.json')
  output = join(directory, 'host-effects.jsonl')
  const runtime = new OrcaRuntimeService()
  const effect = async (method: string, params: unknown) => {
    await writeFile(output, `${JSON.stringify({ method, params })}\n`, { flag: 'a' })
    return null
  }
  vi.spyOn(runtime, 'getGitLabViewer').mockImplementation(() => effect('viewer', {}))
  vi.spyOn(runtime, 'getGitLabRepoIssue').mockImplementation((repo, number) =>
    effect('issue', { repo, number })
  )
  vi.spyOn(runtime, 'getGitLabRepoMergeRequest').mockImplementation((repo, iid) =>
    effect('mr', { repo, iid })
  )
  vi.spyOn(runtime, 'getGitLabRepoMergeRequestForBranch').mockImplementation(
    (repo, branch, linkedMRIid) => effect('mrForBranch', { repo, branch, linkedMRIid })
  )
  vi.spyOn(runtime, 'getGitLabRepoProjectSlug').mockImplementation((repo) =>
    effect('projectSlug', { repo })
  )
  vi.spyOn(runtime, 'listGitLabRepoAssignableUsers').mockImplementation(async (repo) => {
    await effect('listAssignableUsers', { repo })
    return []
  })
  const dispatcher = new RpcDispatcher({ runtime, methods: WORKSPACE_GITLAB_INSPECTION_METHODS })
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
  await rm(directory, { recursive: true, force: true })
})

it('routes six CLI lookups through actual RPC validation to the host fixture', async () => {
  const cases = [
    { command: 'viewer', method: 'viewer', params: {} },
    { command: 'issue', method: 'issue', params: { repo: 'id:ssh-repo', number: 7 } },
    { command: 'mr', method: 'mr', params: { repo: 'id:ssh-repo', iid: 8 } },
    {
      command: 'mr-for-branch',
      method: 'mrForBranch',
      params: { repo: 'id:ssh-repo', branch: 'feature', linkedMRIid: 8 }
    },
    {
      command: 'mr-for-branch',
      method: 'mrForBranch',
      params: { repo: 'id:ssh-repo', branch: '', linkedMRIid: 8 }
    },
    { command: 'project-slug', method: 'projectSlug', params: { repo: 'id:ssh-repo' } },
    {
      command: 'list-assignable-users',
      method: 'listAssignableUsers',
      params: { repo: 'id:ssh-repo' }
    }
  ]
  for (const entry of cases) {
    await writeFile(input, JSON.stringify(entry.params))
    await WORKSPACE_GITLAB_INSPECTION_HANDLERS[`gitlab ${entry.command}`](ctx)
  }
  expect(
    (await readFile(output, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
  ).toEqual(cases.map(({ method, params }) => ({ method, params })))
})

it('rejects invalid issue numbers before dispatch and fails on old peers without fallback', async () => {
  await writeFile(input, JSON.stringify({ repo: 'id:ssh-repo', number: -1 }))
  await expect(WORKSPACE_GITLAB_INSPECTION_HANDLERS['gitlab issue'](ctx)).rejects.toMatchObject({
    code: 'invalid_argument'
  })
  expect(ctx.client.call).not.toHaveBeenCalled()
  await expect(readFile(output)).rejects.toMatchObject({ code: 'ENOENT' })
  await writeFile(input, '{}')
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'old peer')
  )
  await expect(WORKSPACE_GITLAB_INSPECTION_HANDLERS['gitlab viewer'](ctx)).rejects.toMatchObject({
    code: 'method_not_found'
  })
  expect(ctx.client.call).toHaveBeenCalledTimes(1)
  await expect(readFile(output)).rejects.toMatchObject({ code: 'ENOENT' })
})
