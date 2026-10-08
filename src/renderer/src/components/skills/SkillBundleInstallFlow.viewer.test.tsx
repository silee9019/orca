// @vitest-environment happy-dom
import type { SkillBundleInstallResult } from '../../../../shared/skill-bundle-install-contract'
import { useState } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applySkillBundleViewerAction } from '@/runtime/skill-bundle-viewer-controller'
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

describe('SkillBundleInstallFlow viewer', () => {
  it('retries only the failed bundle IDs and verifies their destinations again', async () => {
    const skills = installApi(vi.fn())
    const entry = (id: string) => ({ id, name: id, digest: DIGEST, currentState: 'missing' })
    const preview = (ids: string[]) => ({
      status: 'ok',
      value: {
        packageId: 'pkg_1',
        versionId: 'ver_1',
        bundleDigest: 'c'.repeat(64),
        destinationIdentity: 'local:global',
        skills: ids.map(entry)
      }
    })
    skills.previewBundleInstall
      .mockResolvedValueOnce(preview(['skill-alpha', 'skill-beta']))
      .mockResolvedValue(preview(['skill-alpha']))
    const outcome = (status: string, alphaStatus: string) => ({
      status: 'ok',
      value: {
        operationId: 'op_1',
        packageId: 'pkg_1',
        versionId: 'ver_1',
        bundleDigest: 'c'.repeat(64),
        status,
        skills: [
          {
            skillId: 'skill-alpha',
            name: 'alpha',
            digest: DIGEST,
            status: alphaStatus,
            placements: []
          },
          {
            skillId: 'skill-beta',
            name: 'beta',
            digest: DIGEST,
            status: 'installed',
            placements: []
          }
        ]
      }
    })
    skills.installBundleShare
      .mockResolvedValueOnce(outcome('partial', 'failed'))
      .mockResolvedValue(outcome('complete', 'installed'))
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
    let request: ReturnType<typeof applySkillBundleViewerAction> | undefined
    await act(async () => {
      request = applySkillBundleViewerAction({ kind: 'install' })
    })
    await expect(request).resolves.toMatchObject({ result: { status: 'partial' } })
    await act(async () => {
      request = applySkillBundleViewerAction({ kind: 'retry' })
    })
    await expect(request).resolves.toMatchObject({ result: { status: 'complete' } })
    expect(skills.installBundleShare).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ versionId: 'ver_1', selectedSkillIds: ['skill-alpha'] })
    )
    expect(skills.previewBundleInstall).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ selectedSkills: [expect.objectContaining({ id: 'skill-alpha' })] })
    )
  })

  it('cancels the active bundle operation while preserving its completion acknowledgement', async () => {
    let finish!: (value: { status: 'ok'; value: SkillBundleInstallResult }) => void
    const installing = new Promise<{ status: 'ok'; value: SkillBundleInstallResult }>((resolve) => {
      finish = resolve
    })
    const skills = installApi(vi.fn())
    skills.previewBundleInstall.mockResolvedValue({
      status: 'ok',
      value: {
        packageId: 'pkg_1',
        versionId: 'ver_1',
        bundleDigest: 'c'.repeat(64),
        destinationIdentity: 'local:global',
        skills: [
          { id: 'skill-alpha', name: 'alpha', digest: DIGEST, currentState: 'missing' },
          { id: 'skill-beta', name: 'beta', digest: DIGEST, currentState: 'missing' }
        ]
      }
    })
    skills.installBundleShare.mockReturnValue(installing)
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
    await expect(applySkillBundleViewerAction({ kind: 'cancel' })).rejects.toThrow(
      'skill_installation_not_active'
    )
    let request: ReturnType<typeof applySkillBundleViewerAction> | undefined
    await act(async () => {
      request = applySkillBundleViewerAction({ kind: 'install' })
    })
    const active = await applySkillBundleViewerAction({ kind: 'get' })
    const operationId = active.activeOperationId
    if (!operationId) {
      throw new Error('Expected active bundle operation')
    }
    await expect(applySkillBundleViewerAction({ kind: 'close' })).rejects.toThrow('viewer_busy')
    let cancel: ReturnType<typeof applySkillBundleViewerAction> | undefined
    await act(async () => {
      cancel = applySkillBundleViewerAction({ kind: 'cancel' })
    })
    await expect(cancel).resolves.toMatchObject({ busy: true, activeOperationId: operationId })
    expect(skills.cancelInstall).toHaveBeenCalledExactlyOnceWith({ operationId })
    await act(async () => {
      finish({
        status: 'ok',
        value: {
          operationId,
          packageId: 'pkg_1',
          versionId: 'ver_1',
          bundleDigest: 'c'.repeat(64),
          status: 'cancelled',
          skills: []
        }
      })
    })
    await expect(request).resolves.toMatchObject({
      result: { status: 'cancelled' },
      busy: false,
      activeOperationId: null
    })
  })

  it('uses the existing subset, conflict decision, version and provider policies', async () => {
    const skills = installApi(vi.fn())
    skills.listWslDistros.mockResolvedValue(['Ubuntu'])
    useAppStore.setState({
      folderWorkspaces: [
        {
          id: 'folder-1',
          projectGroupId: 'group-1',
          name: 'Folder fixture',
          folderPath: '/fixture',
          linkedTask: null,
          comment: '',
          isArchived: false,
          isUnread: false,
          isPinned: false,
          sortOrder: 0,
          lastActivityAt: 0,
          createdAt: 0,
          updatedAt: 0
        }
      ],
      sshTargetLabels: new Map([['host-1', 'SSH fixture']]),
      sshConnectionStates: new Map([
        ['host-1', { targetId: 'host-1', status: 'connected', error: null, reconnectAttempt: 0 }]
      ])
    })

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
    skills.installBundleShare.mockResolvedValue({
      status: 'ok',
      value: {
        operationId: 'op_1',
        packageId: 'pkg_1',
        versionId: 'ver_1',
        bundleDigest: 'c'.repeat(64),
        status: 'complete',
        skills: [
          {
            skillId: 'skill-alpha',
            name: 'alpha',
            digest: DIGEST,
            status: 'updated',
            placements: []
          },
          {
            skillId: 'skill-beta',
            name: 'beta',
            digest: DIGEST,
            status: 'installed',
            placements: []
          }
        ]
      }
    })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { skills, preflight: detectionApi(['codex', 'claude']) }
    })
    const version = bundleVersion()
    if (!isSkillBundleVersion(version)) {
      throw new Error('Expected bundle fixture')
    }
    const close = vi.fn()
    const checkedVersion = version
    function Harness() {
      const [open, setOpen] = useState(true)
      return open ? (
        <SkillBundleInstallFlow
          shareId="share_1"
          version={checkedVersion}
          onClose={() => {
            close()
            setOpen(false)
          }}
          onBusyChange={() => undefined}
        />
      ) : null
    }
    render(<Harness />)
    await expect(applySkillBundleViewerAction({ kind: 'get' })).resolves.toMatchObject({
      selectedSkillIds: ['skill-alpha', 'skill-beta']
    })
    let request: ReturnType<typeof applySkillBundleViewerAction> | undefined
    await act(async () => {
      request = applySkillBundleViewerAction({ kind: 'select', id: 'skill-alpha', selected: false })
    })
    await expect(request).resolves.toMatchObject({ selectedSkillIds: ['skill-beta'] })
    expect(screen.getByRole('checkbox', { name: /alpha/ }).getAttribute('data-state')).toBe(
      'unchecked'
    )
    await expect(
      applySkillBundleViewerAction({ kind: 'select', id: 'missing', selected: true })
    ).rejects.toThrow('skill_not_in_bundle')
    await act(async () => {
      request = applySkillBundleViewerAction({ kind: 'select-all', selected: true })
    })
    await request
    await act(async () => {
      request = applySkillBundleViewerAction({ kind: 'scope', value: 'workspace' })
    })
    await expect(request).resolves.toMatchObject({ scope: 'workspace' })
    await act(async () => {
      request = applySkillBundleViewerAction({ kind: 'workspace', value: 'folder-1' })
    })
    await expect(request).resolves.toMatchObject({ workspace: 'folder-1' })
    expect(screen.getByRole('combobox', { name: 'Workspace' }).textContent).toContain(
      'Folder fixture'
    )
    await act(async () => {
      request = applySkillBundleViewerAction({ kind: 'environment', value: 'ssh:host-1' })
    })
    await expect(request).resolves.toMatchObject({
      environmentId: 'ssh:host-1',
      workspace: '',
      executionTarget: null
    })
    await expect(
      applySkillBundleViewerAction({ kind: 'workspace', value: 'folder-1' })
    ).rejects.toThrow('skill_workspace_unavailable')
    await act(async () => {
      request = applySkillBundleViewerAction({ kind: 'environment', value: 'local' })
    })
    await request
    await act(async () => {
      request = applySkillBundleViewerAction({ kind: 'scope', value: 'global' })
    })
    await request
    await act(async () => {
      request = applySkillBundleViewerAction({
        kind: 'execution',
        value: { kind: 'wsl', distro: 'Ubuntu' }
      })
    })
    await expect(request).resolves.toMatchObject({
      executionTarget: { kind: 'wsl', distro: 'Ubuntu' }
    })
    await act(async () => {
      request = applySkillBundleViewerAction({ kind: 'execution', value: null })
    })
    await expect(request).resolves.toMatchObject({ executionTarget: null })
    await act(async () => {
      request = applySkillBundleViewerAction({ kind: 'providers', value: ['codex'] })
    })
    await expect(request).resolves.toMatchObject({ providers: ['codex'] })
    await expect(
      applySkillBundleViewerAction({ kind: 'replace', id: 'skill-alpha', replace: true })
    ).rejects.toThrow('skill_conflict_decision_unavailable')
    await act(async () => {
      request = applySkillBundleViewerAction({ kind: 'install' })
    })
    await expect(request).resolves.toMatchObject({
      destinationPreview: { skills: [{ currentState: 'modified' }, { currentState: 'missing' }] },
      result: null
    })
    expect(skills.installBundleShare).not.toHaveBeenCalled()
    await act(async () => {
      request = applySkillBundleViewerAction({ kind: 'replace', id: 'skill-alpha', replace: true })
    })
    await expect(request).resolves.toMatchObject({ replaceSkillIds: ['skill-alpha'] })
    await act(async () => {
      request = applySkillBundleViewerAction({ kind: 'install' })
    })
    await expect(request).resolves.toMatchObject({ result: { status: 'complete' }, busy: false })
    expect(skills.installBundleShare).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        shareId: 'share_1',
        versionId: 'ver_1',
        selectedSkillIds: ['skill-alpha', 'skill-beta'],
        providers: ['codex'],
        conflictDecisions: [{ skillId: 'skill-alpha', resolution: 'replace-and-discard-local' }]
      })
    )
    await expect(applySkillBundleViewerAction({ kind: 'retry' })).rejects.toThrow(
      'skill_bundle_retry_unavailable'
    )
    await act(async () => {
      request = applySkillBundleViewerAction({ kind: 'close' })
    })
    await expect(request).resolves.toMatchObject({ closed: true })
    await expect(applySkillBundleViewerAction({ kind: 'get' })).rejects.toThrow(
      'viewer_unavailable'
    )
    expect(close).toHaveBeenCalledExactlyOnceWith()
  })
})
