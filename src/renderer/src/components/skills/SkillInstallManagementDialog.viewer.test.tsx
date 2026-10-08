// @vitest-environment happy-dom
import { useState } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { applyManagedSkillViewerAction } from '@/runtime/managed-skill-viewer-controller'
import { useAppStore } from '@/store'
import { SkillInstallManagementDialog } from './SkillInstallManagementDialog'
import {
  version,
  install,
  skillsApi,
  bundleVersion,
  bundleInstall
} from './skill-managed-install-test-fixture'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'api')
})
it('uses loaded groups and versions and preserves removal confirmation', async () => {
  useAppStore.setState({
    runtimeEnvironments: [],
    sshConnectionStates: new Map(),
    sshTargetLabels: new Map()
  })
  const skills = skillsApi(install('ver_1'), [
    version('ver_2', '2026-08-12T00:00:00Z'),
    version('ver_1', '2026-08-11T00:00:00Z')
  ])
  Object.defineProperty(window, 'api', { configurable: true, value: { skills } })
  function Harness() {
    const [open, setOpen] = useState(true)
    return <SkillInstallManagementDialog open={open} onOpenChange={setOpen} />
  }
  render(<Harness />)
  await waitFor(async () => {
    await expect(applyManagedSkillViewerAction({ kind: 'get' })).resolves.toMatchObject({
      inventoryReady: true,
      busy: false
    })
  })
  const inventory = await applyManagedSkillViewerAction({ kind: 'get' })
  const key = inventory.groups[0]?.key
  if (!key) {
    throw new Error('Expected managed install fixture')
  }
  let request: ReturnType<typeof applyManagedSkillViewerAction> | undefined
  await expect(applyManagedSkillViewerAction({ kind: 'select', key: 'missing' })).rejects.toThrow(
    'managed_skill_not_loaded'
  )
  await act(async () => {
    request = applyManagedSkillViewerAction({ kind: 'select', key })
  })
  await expect(request).resolves.toMatchObject({
    selectedKey: key,
    versionId: 'ver_2',
    versionIds: ['ver_2', 'ver_1']
  })
  await expect(
    applyManagedSkillViewerAction({ kind: 'version', value: 'missing' })
  ).rejects.toThrow('managed_skill_version_not_loaded')
  await act(async () => {
    request = applyManagedSkillViewerAction({ kind: 'version', value: 'ver_1' })
  })
  await expect(request).resolves.toMatchObject({ versionId: 'ver_1' })
  await act(async () => {
    request = applyManagedSkillViewerAction({ kind: 'install', discardLocal: false })
  })
  await expect(request).resolves.toMatchObject({ busy: false, result: { status: 'updated' } })
  expect(skills.installPackageVersion).toHaveBeenCalledWith(
    expect.objectContaining({
      packageId: 'pkg_1',
      versionId: 'ver_1',
      destination: { scope: 'global' }
    })
  )
  await act(async () => {
    request = applyManagedSkillViewerAction({ kind: 'select', key })
  })
  await request
  await act(async () => {
    request = applyManagedSkillViewerAction({ kind: 'remove', discardLocal: false })
  })
  await expect(request).resolves.toMatchObject({ confirmRemove: true })
  expect(skills.removeInstall).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Confirm remove' })).toBeTruthy()
  await act(async () => {
    request = applyManagedSkillViewerAction({ kind: 'remove', discardLocal: false })
  })
  await expect(request).resolves.toMatchObject({ result: { status: 'removed' } })
  expect(skills.removeInstall).toHaveBeenCalledExactlyOnceWith({
    name: 'private-skill',
    destination: { scope: 'global' }
  })
  await act(async () => {
    request = applyManagedSkillViewerAction({ kind: 'close' })
  })
  await expect(request).resolves.toMatchObject({ closed: true })
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})

it('waits for the selected SSH inventory and invalidates it after reconnection', async () => {
  const connected = {
    targetId: 'host-1',
    status: 'connected' as const,
    error: null,
    reconnectAttempt: 0,
    connectionGeneration: 1
  }
  useAppStore.setState({
    runtimeEnvironments: [],
    sshConnectionStates: new Map([['host-1', connected]]),
    sshTargetLabels: new Map([['host-1', 'Fixture']])
  })
  const skills = skillsApi(install('ver_1'), [version('ver_1', '2026-08-11T00:00:00Z')])
  Object.defineProperty(window, 'api', { configurable: true, value: { skills } })
  render(<SkillInstallManagementDialog open onOpenChange={vi.fn()} />)
  await waitFor(async () => {
    expect((await applyManagedSkillViewerAction({ kind: 'get' })).inventoryReady).toBe(true)
  })
  let finish!: (value: { status: 'ok'; value: ReturnType<typeof install>[] }) => void
  skills.listManagedInstalls.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  let request: ReturnType<typeof applyManagedSkillViewerAction> | undefined
  let settled = false
  await act(async () => {
    request = applyManagedSkillViewerAction({ kind: 'environment', value: 'ssh:host-1' })
    request.then(() => {
      settled = true
    })
  })
  expect(settled).toBe(false)
  expect(skills.listManagedInstalls).toHaveBeenLastCalledWith('ssh:host-1')
  await expect(applyManagedSkillViewerAction({ kind: 'select', key: 'missing' })).rejects.toThrow(
    'viewer_busy'
  )
  await act(async () => {
    finish({
      status: 'ok',
      value: [
        {
          ...install('ver_1'),
          destinationIdentity: 'ssh:host-1',
          destination: { scope: 'global', executionTarget: { kind: 'ssh', connectionId: 'host-1' } }
        }
      ]
    })
  })
  await expect(request).resolves.toMatchObject({
    environmentId: 'ssh:host-1',
    inventoryReady: true
  })
  const current = await applyManagedSkillViewerAction({ kind: 'get' })
  const key = current.groups[0]?.key
  if (!key) {
    throw new Error('Expected SSH inventory')
  }
  await act(async () => {
    useAppStore.setState({
      sshConnectionStates: new Map([['host-1', { ...connected, connectionGeneration: 2 }]])
    })
  })
  expect((await applyManagedSkillViewerAction({ kind: 'get' })).inventoryReady).toBe(false)
  await expect(applyManagedSkillViewerAction({ kind: 'select', key })).rejects.toThrow(
    'viewer_busy'
  )
  await act(async () => {
    finish({ status: 'ok', value: [] })
  })
  await waitFor(async () => {
    expect((await applyManagedSkillViewerAction({ kind: 'get' })).inventoryReady).toBe(true)
  })
  await expect(applyManagedSkillViewerAction({ kind: 'select', key })).rejects.toThrow(
    'managed_skill_not_loaded'
  )
  expect(skills.removeInstall).not.toHaveBeenCalled()
  await expect(
    applyManagedSkillViewerAction({ kind: 'environment', value: 'ssh:unknown' })
  ).rejects.toThrow('skill_environment_unavailable')
})

it('guards discard decisions and cancels only the active pinned operation', async () => {
  useAppStore.setState({
    runtimeEnvironments: [],
    sshConnectionStates: new Map(),
    sshTargetLabels: new Map()
  })
  const skills = skillsApi(install('ver_1'), [version('ver_1', '2026-08-11T00:00:00Z')])
  Object.defineProperty(window, 'api', { configurable: true, value: { skills } })
  render(<SkillInstallManagementDialog open onOpenChange={vi.fn()} />)
  await waitFor(async () => {
    expect((await applyManagedSkillViewerAction({ kind: 'get' })).inventoryReady).toBe(true)
  })
  const key = (await applyManagedSkillViewerAction({ kind: 'get' })).groups[0]?.key
  if (!key) {
    throw new Error('Expected install')
  }
  let request: ReturnType<typeof applyManagedSkillViewerAction> | undefined
  await act(async () => {
    request = applyManagedSkillViewerAction({ kind: 'select', key })
  })
  await request
  await expect(
    applyManagedSkillViewerAction({ kind: 'install', discardLocal: true })
  ).rejects.toThrow('skill_conflict_decision_unavailable')
  await expect(
    applyManagedSkillViewerAction({ kind: 'remove', discardLocal: true })
  ).rejects.toThrow('skill_conflict_decision_unavailable')
  await expect(applyManagedSkillViewerAction({ kind: 'cancel' })).rejects.toThrow(
    'skill_installation_not_active'
  )
  let finish!: (value: unknown) => void
  skills.installPackageVersion.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  await act(async () => {
    request = applyManagedSkillViewerAction({ kind: 'install', discardLocal: false })
  })
  const active = await applyManagedSkillViewerAction({ kind: 'get' })
  expect(active.activeOperationId).toBeTruthy()
  await expect(applyManagedSkillViewerAction({ kind: 'close' })).rejects.toThrow('viewer_busy')
  let cancellation: ReturnType<typeof applyManagedSkillViewerAction> | undefined
  await act(async () => {
    cancellation = applyManagedSkillViewerAction({ kind: 'cancel' })
  })
  await expect(cancellation).resolves.toMatchObject({ busy: true })
  expect(skills.cancelInstall).toHaveBeenCalledExactlyOnceWith({
    operationId: active.activeOperationId
  })
  await act(async () => {
    finish({
      status: 'ok',
      value: {
        operationId: active.activeOperationId,
        status: 'cancelled',
        name: 'private-skill',
        packageDigest: 'a'.repeat(64),
        placements: []
      }
    })
  })
  await expect(request).resolves.toMatchObject({ busy: false, result: { status: 'cancelled' } })
})

it('uses explicit bundle discard choices for only the currently installed names and reloads inventory', async () => {
  useAppStore.setState({
    runtimeEnvironments: [],
    sshConnectionStates: new Map(),
    sshTargetLabels: new Map()
  })
  const skills = skillsApi(
    [bundleInstall('alpha', 'modified')],
    [bundleVersion('ver_2', ['alpha', 'beta'])]
  )
  Object.defineProperty(window, 'api', { configurable: true, value: { skills } })
  render(<SkillInstallManagementDialog open onOpenChange={vi.fn()} />)
  await waitFor(async () => {
    expect((await applyManagedSkillViewerAction({ kind: 'get' })).inventoryReady).toBe(true)
  })
  const key = (await applyManagedSkillViewerAction({ kind: 'get' })).groups[0]?.key
  if (!key) {
    throw new Error('Expected bundle')
  }
  let request: ReturnType<typeof applyManagedSkillViewerAction> | undefined
  await act(async () => {
    request = applyManagedSkillViewerAction({ kind: 'select', key })
  })
  await request
  await act(async () => {
    request = applyManagedSkillViewerAction({ kind: 'select', key: null })
  })
  await expect(request).resolves.toMatchObject({ selectedKey: '', versionIds: [] })
  await act(async () => {
    request = applyManagedSkillViewerAction({ kind: 'select', key })
  })
  await request
  await act(async () => {
    request = applyManagedSkillViewerAction({ kind: 'install', discardLocal: true })
  })
  await expect(request).resolves.toMatchObject({
    bundleResult: { status: 'complete' },
    busy: false
  })
  expect(skills.installBundlePackageVersion).toHaveBeenCalledWith(
    expect.objectContaining({
      packageId: 'pkg_1',
      versionId: 'ver_2',
      selectedSkillIds: ['alpha'],
      conflictDecisions: [{ skillId: 'alpha', resolution: 'replace-and-discard-local' }]
    })
  )
  await act(async () => {
    request = applyManagedSkillViewerAction({ kind: 'select', key })
  })
  await request
  await act(async () => {
    request = applyManagedSkillViewerAction({ kind: 'remove', discardLocal: true })
  })
  await request
  expect(skills.removeInstall).toHaveBeenCalledExactlyOnceWith({
    name: 'alpha',
    destination: { scope: 'global' },
    conflictResolution: 'replace-and-discard-local'
  })
  skills.listManagedInstalls.mockResolvedValue({ status: 'ok', value: [] })
  await act(async () => {
    request = applyManagedSkillViewerAction({ kind: 'refresh' })
  })
  await expect(request).resolves.toMatchObject({
    inventoryReady: true,
    groups: [],
    selectedKey: ''
  })
})

it('does not cancel or reload a new SSH incarnation when an old installation finishes', async () => {
  const connected = {
    targetId: 'host-1',
    status: 'connected' as const,
    error: null,
    reconnectAttempt: 0,
    connectionGeneration: 1
  }
  useAppStore.setState({
    runtimeEnvironments: [],
    sshConnectionStates: new Map([['host-1', connected]]),
    sshTargetLabels: new Map([['host-1', 'Fixture']])
  })
  const skills = skillsApi(install('ver_1'), [version('ver_1', '2026-08-11T00:00:00Z')])
  Object.defineProperty(window, 'api', { configurable: true, value: { skills } })
  render(<SkillInstallManagementDialog open onOpenChange={vi.fn()} />)
  await waitFor(async () => {
    expect((await applyManagedSkillViewerAction({ kind: 'get' })).inventoryReady).toBe(true)
  })
  let request: ReturnType<typeof applyManagedSkillViewerAction> | undefined
  await act(async () => {
    request = applyManagedSkillViewerAction({ kind: 'environment', value: 'ssh:host-1' })
  })
  await request
  const key = (await applyManagedSkillViewerAction({ kind: 'get' })).groups[0]?.key
  if (!key) {
    throw new Error('Expected SSH install')
  }
  await act(async () => {
    request = applyManagedSkillViewerAction({ kind: 'select', key })
  })
  await request
  let finish!: (value: unknown) => void
  skills.installPackageVersion.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  let failed: unknown
  await act(async () => {
    request = applyManagedSkillViewerAction({ kind: 'install', discardLocal: false })
    request.catch((error: unknown) => {
      failed = error
    })
  })
  await act(async () => {
    useAppStore.setState({
      sshConnectionStates: new Map([['host-1', { ...connected, connectionGeneration: 2 }]])
    })
  })
  expect(failed).toBeInstanceOf(Error)
  await expect(applyManagedSkillViewerAction({ kind: 'cancel' })).rejects.toThrow(
    'viewer_target_changed'
  )
  expect(skills.cancelInstall).not.toHaveBeenCalled()
  const count = skills.listManagedInstalls.mock.calls.length
  await act(async () => {
    finish({
      status: 'ok',
      value: {
        status: 'updated',
        operationId: 'old',
        name: 'private-skill',
        packageDigest: 'a'.repeat(64),
        placements: []
      }
    })
  })
  expect(skills.listManagedInstalls).toHaveBeenCalledTimes(count)
  expect((await applyManagedSkillViewerAction({ kind: 'get' })).result).toBeNull()
})
