// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { applyManagedSkillViewerAction as apply } from '@/runtime/managed-skill-viewer-controller'
import { useAppStore } from '@/store'
import { SkillInstallManagementDialog } from './SkillInstallManagementDialog'
import { version, install, skillsApi } from './skill-managed-install-test-fixture'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'api')
})
it('uses the same machine selection for the actual Select and managed viewer inventory', async () => {
  useAppStore.setState({
    runtimeEnvironments: [],
    sshTargetLabels: new Map([
      ['host-1', 'Fixture'],
      ['offline', 'Offline fixture']
    ]),
    sshConnectionStates: new Map([
      [
        'host-1',
        {
          targetId: 'host-1',
          status: 'connected',
          error: null,
          reconnectAttempt: 0,
          connectionGeneration: 1
        }
      ],
      ['offline', { targetId: 'offline', status: 'disconnected', error: null, reconnectAttempt: 0 }]
    ])
  })
  const skills = skillsApi(install('ver_1'), [version('ver_1', '2026-08-11T00:00:00Z')])
  Object.defineProperty(window, 'api', { configurable: true, value: { skills } })
  render(<SkillInstallManagementDialog open onOpenChange={vi.fn()} />)
  await waitFor(async () => {
    expect((await apply({ kind: 'get' })).inventoryReady).toBe(true)
  })
  expect(screen.getByRole('combobox').textContent).toContain('This computer')
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'environment', value: 'ssh:host-1' })
  })
  await expect(pending).resolves.toMatchObject({
    environmentId: 'ssh:host-1',
    inventoryReady: true
  })
  expect(screen.getByRole('combobox').textContent).toContain('Fixture')
  expect(skills.listManagedInstalls).toHaveBeenLastCalledWith('ssh:host-1')
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
  const offline = screen.getByRole('option', { name: /Offline fixture/ })
  expect(offline.getAttribute('aria-disabled')).toBe('true')
  await expect(apply({ kind: 'environment', value: 'ssh:offline' })).rejects.toThrow(
    'skill_environment_unavailable'
  )
  fireEvent.click(screen.getByRole('option', { name: 'This computer' }))
  await waitFor(async () => {
    expect(await apply({ kind: 'get' })).toMatchObject({
      environmentId: 'local',
      inventoryReady: true
    })
  })
  expect(screen.getByRole('combobox').textContent).toContain('This computer')
  expect(skills.listManagedInstalls).toHaveBeenLastCalledWith(undefined)
  expect(skills.removeInstall).not.toHaveBeenCalled()
  expect(skills.installPackageVersion).not.toHaveBeenCalled()
})
