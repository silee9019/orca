import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { HandlerContext } from '../../src/cli/dispatch'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { WORKSPACE_FOLDER_HANDLERS } from '../../src/cli/handlers/workspace-folder'
import { WORKSPACE_PROJECT_GROUP_HANDLERS } from '../../src/cli/handlers/workspace-project-group'
import {
  FolderWorkspaceCreate,
  FolderWorkspaceSelector,
  FolderWorkspaceUpdate
} from '../../src/shared/rpc-contract/folder-workspace-params'
import {
  ProjectGroupCreate,
  ProjectGroupSelector,
  ProjectGroupUpdate
} from '../../src/shared/rpc-contract/repo-params'
import * as appEnvironment from '../../src/shared/app-environment'
import { Store } from '../../src/main/persistence'
import { ProfileStateSqliteAuthority } from '../../src/main/persistence/profile-state/profile-state-sqlite-authority'
import { readProfileStateDomain } from '../../src/main/persistence/profile-state/profile-state-domain-reader'
import { RuntimeProjectGroupController } from '../../src/main/runtime/runtime-project-group-controller'

vi.mock('../../src/main/telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../../src/main/telemetry/cohort-classifier', () => ({
  getCohortAtEmit: () => ({ nth_repo_added: 2 })
}))
vi.mock('../../src/main/ssh/ssh-config-parser', () => ({
  loadUserSshConfig: () => ({ hosts: [] }),
  sshConfigHostsToTargets: () => []
}))

let directory: string | undefined
let store: Store | undefined
let authority: ProfileStateSqliteAuthority | undefined
afterEach(async () => {
  if (store) {
    store.freezeWrites()
    await store.flushAsync()
  }
  authority?.close()
  vi.restoreAllMocks()
  if (directory) {
    await rm(directory, { recursive: true, force: true })
  }
})

it('persists plain-folder workspace and group changes through the existing controller and isolated SQLite profile', async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-cli-folder-effect-'))
  const fixturePath = directory
  vi.spyOn(appEnvironment, 'getAppEnvironment').mockReturnValue({
    getPath: () => fixturePath,
    getAppPath: () => fixturePath,
    getVersion: () => 'fixture',
    isPackaged: () => false,
    onWillQuit: () => {},
    exit: () => {},
    getAppMetrics: () => []
  })
  const folder = join(directory, 'plain-folder')
  await mkdir(folder)
  const databasePath = join(directory, 'profile-state.db')
  authority = new ProfileStateSqliteAuthority(databasePath, 'fixture')
  vi.spyOn(authority, 'scheduleBackup').mockImplementation(() => {})
  const profile = new Store({
    dataFile: join(directory, 'orca-data.json'),
    profileStateAuthority: authority
  })
  store = profile
  const untouched = profile.createProjectGroup({
    name: 'Keep',
    parentPath: folder,
    parentGroupId: null,
    createdFrom: 'manual'
  })
  const teardown = vi.fn().mockResolvedValue(undefined)
  const notify = vi.fn()
  const controller = new RuntimeProjectGroupController({
    getStore: () => profile,
    resolveRepo: async () => {
      throw new Error('Plain folder fixture must not resolve Git')
    },
    notifyReposChanged: notify,
    resolveFolderConnectionId: () => null,
    teardownFolderWorkspacePtys: teardown,
    cleanupRemovedFolderWorkspaceState: vi.fn()
  })
  const client = new RuntimeClient(directory)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(client, 'call').mockImplementation(async (method, payload) => {
    let result: unknown
    switch (method) {
      case 'projectGroup.create':
        result = await controller.createGroup(ProjectGroupCreate.parse(payload))
        break
      case 'projectGroup.update': {
        const p = ProjectGroupUpdate.parse(payload)
        result = await controller.updateGroup(p.groupId, p.updates)
        break
      }
      case 'projectGroup.delete':
        result = await controller.deleteGroup(ProjectGroupSelector.parse(payload).groupId)
        break
      case 'folderWorkspace.create':
        result = await controller.createFolderWorkspace(FolderWorkspaceCreate.parse(payload))
        break
      case 'folderWorkspace.update': {
        const p = FolderWorkspaceUpdate.parse(payload)
        result = await controller.updateFolderWorkspace(p.folderWorkspaceId, p.updates)
        break
      }
      case 'folderWorkspace.delete':
        result = await controller.deleteFolderWorkspace(
          FolderWorkspaceSelector.parse(payload).folderWorkspaceId
        )
        break
      default:
        throw new Error(`Unexpected fixture method: ${method}`)
    }
    return { id: 'fixture', ok: true, result, _meta: { runtimeId: 'isolated-fixture' } }
  })
  const input = join(directory, 'input.json')
  const ctx: HandlerContext = {
    client,
    cwd: directory,
    json: true,
    flags: new Map([['params-file', input]])
  }
  const handlers = { ...WORKSPACE_FOLDER_HANDLERS, ...WORKSPACE_PROJECT_GROUP_HANDLERS }
  const run = async (command: string, params: unknown, confirm?: string) => {
    await writeFile(input, JSON.stringify(params))
    ctx.flags.delete('confirm')
    if (confirm) {
      ctx.flags.set('confirm', confirm)
    }
    await handlers[command](ctx)
    profile.flushOrThrow()
  }
  await run('project-group create', { name: 'Group', parentPath: folder })
  const group = profile.getProjectGroups().find((value) => value.name === 'Group')
  expect(group).toBeDefined()
  if (!group) {
    throw new Error('Expected created fixture group')
  }
  await run('folder-workspace create', { projectGroupId: group.id, name: 'Plain folder' })
  const workspace = profile.getFolderWorkspaces()[0]
  expect(workspace.folderPath).toBe(folder)
  await expect(stat(join(folder, '.git'))).rejects.toMatchObject({ code: 'ENOENT' })
  await run('folder-workspace update', {
    folderWorkspaceId: workspace.id,
    updates: { comment: 'Saved', isPinned: true }
  })
  await run('project-group update', { groupId: group.id, updates: { name: 'Renamed' } })
  expect(readProfileStateDomain(databasePath, 'fixture', 'folderWorkspaces')).toMatchObject({
    kind: 'value',
    value: [{ id: workspace.id, comment: 'Saved', isPinned: true }]
  })
  expect(profile.getProjectGroups().find((value) => value.id === group.id)?.name).toBe('Renamed')
  expect(readProfileStateDomain(databasePath, 'fixture', 'projectGroups')).toMatchObject({
    kind: 'value',
    value: expect.arrayContaining([{ ...group, name: 'Renamed', updatedAt: expect.any(Number) }])
  })
  await run('folder-workspace delete', { folderWorkspaceId: workspace.id }, workspace.id)
  expect(teardown).toHaveBeenCalledWith(`folder:${workspace.id}`, null)
  expect(profile.getFolderWorkspaces()).toEqual([])
  await run('project-group delete', { groupId: group.id }, group.id)
  expect(profile.getProjectGroups()).toEqual([untouched])
  expect(readProfileStateDomain(databasePath, 'fixture', 'folderWorkspaces')).toMatchObject({
    kind: 'value',
    value: []
  })
  expect(readProfileStateDomain(databasePath, 'fixture', 'projectGroups')).toMatchObject({
    kind: 'value',
    value: [untouched]
  })
  expect(notify).toHaveBeenCalledTimes(6)
})
