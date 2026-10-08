import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import * as appEnvironment from '../../src/shared/app-environment'
import { Store } from '../../src/main/persistence'
import { ProfileStateSqliteAuthority } from '../../src/main/persistence/profile-state/profile-state-sqlite-authority'
import { readProfileStateDomain } from '../../src/main/persistence/profile-state/profile-state-domain-reader'
import { RuntimeProjectHostSetupController } from '../../src/main/runtime/runtime-project-host-setup-controller'
import type { Repo } from '../../src/shared/repo-types'

vi.mock('../../src/main/telemetry/client', () => ({ track: vi.fn() }))
vi.mock('../../src/main/ssh/ssh-config-parser', () => ({
  loadUserSshConfig: () => ({ hosts: [] }),
  sshConfigHostsToTargets: () => []
}))
vi.mock('../../src/main/ipc/filesystem-auth', () => ({ invalidateAuthorizedRootsCache: vi.fn() }))
vi.mock('../../src/main/worktree-root-preparation', () => ({
  prepareLocalWorktreeRootForRepo: vi.fn()
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

it('publishes successful setup metadata changes after invalidating the selected repository caches', async () => {
  directory = await mkdtemp(join(tmpdir(), 'orca-project-notify-'))
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
  const databasePath = join(directory, 'profile-state.db')
  authority = new ProfileStateSqliteAuthority(databasePath, 'fixture')
  vi.spyOn(authority, 'scheduleBackup').mockImplementation(() => {})
  const profile = new Store({
    dataFile: join(directory, 'orca-data.json'),
    profileStateAuthority: authority
  })
  store = profile
  const repo: Repo = {
    id: 'repo',
    path: join(directory, 'plain-folder'),
    displayName: 'Fixture',
    badgeColor: 'blue',
    addedAt: 1,
    kind: 'folder'
  }
  profile.addRepo(repo)
  const project = profile.getProjects()[0]
  const repoSetup = profile.getProjectHostSetups()[0]
  expect(project).toBeDefined()
  const invalidate = vi.fn()
  const scan = vi.fn()
  const snapshots: string[][] = []
  const notify = vi.fn(() =>
    snapshots.push(profile.getProjectHostSetups().map((setup) => setup.displayName))
  )
  const controller = new RuntimeProjectHostSetupController({
    getStore: () => profile,
    listRepos: () => profile.getRepos(),
    addRepo: async () => repo,
    addRemoteRepo: async () => {
      throw new Error('Unexpected remote registration')
    },
    cloneRepo: async () => {
      throw new Error('Unexpected clone')
    },
    invalidateResolvedWorktrees: invalidate,
    invalidateWorktreeScan: scan,
    notifyReposChanged: notify
  })
  const created = controller.createSetup({
    projectId: project.id,
    hostId: 'runtime:fixture',
    displayName: 'Created'
  })
  expect(notify).toHaveBeenCalledTimes(1)
  expect(snapshots.at(-1)).toContain('Created')
  controller.updateSetup({ setupId: created.setup.id, updates: { displayName: 'Updated' } })
  expect(notify).toHaveBeenCalledTimes(2)
  expect(snapshots.at(-1)).toContain('Updated')
  controller.deleteSetup({ setupId: created.setup.id })
  expect(notify).toHaveBeenCalledTimes(3)
  expect(snapshots.at(-1)).not.toContain('Updated')
  expect(invalidate).toHaveBeenCalledTimes(3)
  expect(scan).not.toHaveBeenCalled()
  controller.updateSetup({ setupId: repoSetup.id, updates: { displayName: 'Repo updated' } })
  expect(scan).toHaveBeenCalledExactlyOnceWith(repo.id)
  await controller.setupExistingFolder({
    projectId: project.id,
    hostId: 'local',
    path: repo.path,
    kind: 'folder'
  })
  expect(notify).toHaveBeenCalledTimes(5)
  expect(invalidate).toHaveBeenCalledTimes(5)
  expect(scan).toHaveBeenCalledTimes(2)
  profile.flushOrThrow()
  expect(readProfileStateDomain(databasePath, 'fixture', 'projectHostSetups')).toMatchObject({
    kind: 'value',
    value: expect.arrayContaining([expect.objectContaining({ id: repoSetup.id })])
  })
  for (const operation of [
    () => controller.createSetup({ projectId: 'missing', hostId: 'local' }),
    () => controller.updateSetup({ setupId: 'missing', updates: { displayName: 'Missing' } }),
    () => controller.deleteSetup({ setupId: 'missing' })
  ]) {
    expect(operation).toThrow('not found')
  }
  expect(notify).toHaveBeenCalledTimes(5)
})
