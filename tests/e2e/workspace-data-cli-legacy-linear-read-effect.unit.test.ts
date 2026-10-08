import { ctx, store } from './workspace-data-cli-remote-clone-fixture'
import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('../../src/main/runtime/runtime-linear-command-dependencies', async (original) => ({
  ...(await original<typeof provider>())
}))
vi.mock('../../src/main/linear/projects', async (original) => ({
  ...(await original<typeof projects>())
}))
import * as provider from '../../src/main/runtime/runtime-linear-command-dependencies'
import * as projects from '../../src/main/linear/projects'
import { LINEAR_HANDLERS } from '../../src/cli/handlers/linear'
import { LINEAR_AGENT_ACCESS_METHODS } from '../../src/main/runtime/rpc/methods/linear-agent-access'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { RpcDispatcher } from '../../src/main/runtime/rpc/dispatcher'
import { RuntimeClientError } from '../../src/cli/runtime-client'
const team = {
  id: 'team',
  key: 'TEST',
  name: 'Fixture team',
  workspaceId: 'workspace',
  workspaceName: 'Fixture workspace'
}
async function invoke(action: string, flags: Record<string, string> = {}) {
  ctx.flags = new Map(Object.entries({ workspace: 'workspace', ...flags }))
  await LINEAR_HANDLERS[`linear ${action}`](ctx)
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]).result
}
beforeEach(() => {
  vi.spyOn(provider, 'getLinearStatus').mockReturnValue({
    connected: true,
    viewer: null,
    workspaces: [
      {
        id: 'workspace',
        organizationId: 'organization',
        organizationName: 'Fixture workspace',
        displayName: 'Fixture',
        email: null
      }
    ]
  })
  vi.spyOn(provider, 'listLinearTeamsForAgent').mockResolvedValue({ teams: [team], errors: [] })
  vi.spyOn(provider, 'listLinearTeamsOrThrow').mockResolvedValue([team])
  vi.spyOn(provider, 'getLinearTeamMembersOrThrow').mockResolvedValue([])
  vi.spyOn(provider, 'getLinearTeamStatesOrThrow').mockResolvedValue([])
  vi.spyOn(provider, 'getLinearTeamLabelsOrThrow').mockResolvedValue([])
  vi.spyOn(provider, 'listLinearIssues').mockResolvedValue({ items: [] })
  vi.spyOn(projects, 'listProjects').mockResolvedValue({
    items: [{ id: 'project', name: 'Fixture project', workspaceId: 'workspace' }]
  })
  vi.spyOn(provider, 'searchLinearIssuesForAgents').mockImplementation(async (args) => ({
    issues: [],
    truncated: false,
    meta: {
      query: args.query,
      workspaceId: args.workspaceId,
      limit: args.limit ?? 20,
      returned: 0,
      limitReached: false,
      partial: false,
      workspaceErrors: []
    }
  }))
  const dispatcher = new RpcDispatcher({
    runtime: new OrcaRuntimeService(store),
    methods: LINEAR_AGENT_ACCESS_METHODS
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
it('projects teams and resolves a case-insensitive key to the exact workspace/team adapter', async () => {
  expect((await invoke('team list')).teams).toEqual([
    expect.objectContaining({
      id: 'team',
      key: 'TEST',
      workspace: { id: 'workspace', name: 'Fixture workspace' }
    })
  ])
  expect(provider.listLinearTeamsForAgent).toHaveBeenCalledExactlyOnceWith('workspace')
  for (const action of ['members', 'states', 'labels']) {
    const result = await invoke(`team ${action}`, { team: 'test' })
    expect(result.team.id).toBe('team')
    expect(result[action]).toEqual([])
  }
  expect(provider.getLinearTeamMembersOrThrow).toHaveBeenCalledExactlyOnceWith('team', 'workspace')
  expect(provider.getLinearTeamStatesOrThrow).toHaveBeenCalledExactlyOnceWith('team', 'workspace')
  expect(provider.getLinearTeamLabelsOrThrow).toHaveBeenCalledExactlyOnceWith('team', 'workspace')
})
it('preserves issue filters, project query and search limits through the original runtime', async () => {
  const issues = await invoke('list', { team: 'TEST', filter: 'all', limit: '5' })
  expect(issues.issues).toEqual([])
  expect(provider.listLinearIssues).toHaveBeenCalledExactlyOnceWith('all', 5, 'workspace', {
    teamId: 'team'
  })
  const result = await invoke('project list', { query: 'Fixture', limit: '5' })
  expect(result.projects[0]).toMatchObject({ id: 'project', name: 'Fixture project' })
  expect(projects.listProjects).toHaveBeenCalledExactlyOnceWith('Fixture', 5, 'workspace', true)
  await invoke('search', { query: 'fixture', limit: '5' })
  expect(provider.searchLinearIssuesForAgents).toHaveBeenCalledExactlyOnceWith({
    query: 'fixture',
    limit: 5,
    workspaceId: 'workspace'
  })
})
it('refuses an unknown workspace or ambiguous team before reading its member adapter', async () => {
  await expect(
    invoke('team members', { team: 'TEST', workspace: 'missing' })
  ).rejects.toMatchObject({ code: 'linear_invalid_workspace' })
  vi.mocked(provider.listLinearTeamsOrThrow).mockResolvedValue([
    team,
    { ...team, id: 'other-team', workspaceId: 'other-workspace' }
  ])
  await expect(invoke('team members', { team: 'TEST' })).rejects.toMatchObject({
    code: 'linear_workspace_ambiguous'
  })
  expect(provider.getLinearTeamMembersOrThrow).not.toHaveBeenCalled()
})
it('rejects malformed limits before any RPC and preserves an old peer failure', async () => {
  await expect(invoke('search', { query: 'fixture', limit: '0' })).rejects.toMatchObject({
    code: 'invalid_argument'
  })
  expect(ctx.client.call).not.toHaveBeenCalled()
  vi.mocked(ctx.client.call).mockRejectedValue(
    new RuntimeClientError('method_not_found', 'Old peer')
  )
  await expect(invoke('team list')).rejects.toMatchObject({ code: 'method_not_found' })
  expect(provider.listLinearTeamsForAgent).not.toHaveBeenCalled()
})
