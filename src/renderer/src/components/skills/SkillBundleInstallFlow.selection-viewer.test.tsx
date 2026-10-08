// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { applySkillBundleViewerAction as apply } from '@/runtime/skill-bundle-viewer-controller'
import { useAppStore } from '@/store'
import { SkillBundleInstallFlow } from './SkillBundleInstallFlow'
import { isSkillBundleVersion } from './skill-share-version-summary'
import {
  DIGEST,
  bundleVersion,
  detectionApi,
  installApi
} from './skill-install-dialog-test-fixture'

beforeEach(() => {
  useAppStore.setState({
    runtimeEnvironments: [],
    runtimeStatusByEnvironmentId: new Map(),
    repos: [],
    worktreesByRepo: {},
    folderWorkspaces: [],
    sshConnectionStates: new Map(),
    sshTargetLabels: new Map()
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'api')
})
it('shares checklist selection and preview invalidation between the actual row checkbox and public viewer', async () => {
  const skills = installApi(vi.fn())
  skills.previewBundleInstall.mockResolvedValue({
    status: 'ok',
    value: {
      packageId: 'pkg_1',
      versionId: 'ver_1',
      bundleDigest: 'c'.repeat(64),
      destinationIdentity: 'local:global',
      skills: [
        { id: 'skill-alpha', name: 'alpha', digest: DIGEST, currentState: 'modified' },
        { id: 'skill-beta', name: 'beta', digest: DIGEST, currentState: 'missing' }
      ]
    }
  })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { skills, preflight: detectionApi(['codex']) }
  })
  const version = bundleVersion()
  if (!isSkillBundleVersion(version)) {
    throw new Error('Expected bundle fixture')
  }
  render(
    <SkillBundleInstallFlow
      shareId="share_1"
      version={version}
      onClose={() => undefined}
      onBusyChange={() => undefined}
    />
  )
  let pending: ReturnType<typeof apply> | undefined
  await act(async () => {
    pending = apply({ kind: 'select', id: 'skill-alpha', selected: false })
  })
  await expect(pending).resolves.toMatchObject({ selectedSkillIds: ['skill-beta'] })
  expect(screen.getByRole('checkbox', { name: /alpha/ }).getAttribute('data-state')).toBe(
    'unchecked'
  )
  fireEvent.click(screen.getByRole('checkbox', { name: /alpha/ }))
  expect((await apply({ kind: 'get' })).selectedSkillIds).toEqual(['skill-beta', 'skill-alpha'])
  await act(async () => {
    pending = apply({ kind: 'select-all', selected: false })
  })
  await expect(pending).resolves.toMatchObject({ selectedSkillIds: [] })
  for (const name of [/alpha/, /beta/]) {
    expect(screen.getByRole('checkbox', { name }).getAttribute('data-state')).toBe('unchecked')
  }
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select all' }))
  expect((await apply({ kind: 'get' })).selectedSkillIds).toEqual(['skill-alpha', 'skill-beta'])
  await act(async () => {
    pending = apply({ kind: 'install' })
  })
  await expect(pending).resolves.toMatchObject({
    destinationPreview: { skills: [{ currentState: 'modified' }, { currentState: 'missing' }] },
    result: null
  })
  await act(async () => {
    pending = apply({ kind: 'replace', id: 'skill-alpha', replace: true })
  })
  await expect(pending).resolves.toMatchObject({ replaceSkillIds: ['skill-alpha'] })
  fireEvent.click(screen.getByRole('checkbox', { name: 'beta' }))
  expect(await apply({ kind: 'get' })).toMatchObject({
    selectedSkillIds: ['skill-alpha'],
    destinationPreview: null,
    replaceSkillIds: []
  })
  await act(async () => {
    pending = apply({ kind: 'select', id: 'skill-beta', selected: true })
  })
  await expect(pending).resolves.toMatchObject({
    selectedSkillIds: ['skill-alpha', 'skill-beta'],
    destinationPreview: null,
    replaceSkillIds: []
  })
  expect(screen.getByRole('checkbox', { name: 'beta' }).getAttribute('data-state')).toBe('checked')
  expect(skills.installBundleShare).not.toHaveBeenCalled()
})
