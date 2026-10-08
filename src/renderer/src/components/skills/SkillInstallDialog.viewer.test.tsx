// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SkillInstallResult } from '../../../../shared/skill-install-contract'
import type { SkillCloudVersion } from '../../../../shared/skill-cloud-contract'
import { applySkillInstallViewerAction } from '@/runtime/skill-install-viewer-controller'
import { useAppStore } from '@/store'
import { SkillInstallDialog } from './SkillInstallDialog'
import { DIGEST, version, detectionApi, installApi } from './skill-install-dialog-test-fixture'

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

describe('SkillInstallDialog viewer', () => {
  it('acknowledges the existing link inspection and target fields without installing', async () => {
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
      ]
    })
    useAppStore.setState({
      sshTargetLabels: new Map([['host-1', 'SSH fixture']]),
      sshConnectionStates: new Map([
        ['host-1', { targetId: 'host-1', status: 'connected', error: null, reconnectAttempt: 0 }]
      ])
    })
    const skills = installApi(vi.fn())
    skills.listWslDistros.mockResolvedValue(['Ubuntu'])
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { skills, preflight: detectionApi(['claude', 'codex']) }
    })
    render(<SkillInstallDialog open onOpenChange={() => undefined} />)
    let request: ReturnType<typeof applySkillInstallViewerAction> | undefined
    await act(async () => {
      request = applySkillInstallViewerAction({
        kind: 'link',
        value: 'https://app.orca.dev/skills/share/share_1'
      })
    })
    await expect(request).resolves.toMatchObject({
      link: 'https://app.orca.dev/skills/share/share_1',
      preview: null
    })
    expect(screen.getByLabelText('Orca skill link')).toHaveProperty(
      'value',
      'https://app.orca.dev/skills/share/share_1'
    )
    await act(async () => {
      request = applySkillInstallViewerAction({ kind: 'inspect' })
    })
    await expect(request).resolves.toMatchObject({
      preview: { shareId: 'share_1', version: { versionId: 'ver_1' } },
      busy: false
    })
    expect(skills.resolveShare).toHaveBeenCalledWith('share_1')
    expect(screen.getByText('A private skill')).toBeTruthy()
    await act(async () => {
      request = applySkillInstallViewerAction({ kind: 'providers', value: ['codex'] })
    })
    await expect(request).resolves.toMatchObject({ providers: ['codex'] })
    await act(async () => {
      request = applySkillInstallViewerAction({
        kind: 'execution',
        value: { kind: 'wsl', distro: 'Ubuntu' }
      })
    })
    await expect(request).resolves.toMatchObject({
      executionTarget: { kind: 'wsl', distro: 'Ubuntu' }
    })
    await expect(
      applySkillInstallViewerAction({
        kind: 'execution',
        value: { kind: 'wsl', distro: 'Missing' }
      })
    ).rejects.toThrow('skill_execution_target_unavailable')
    await expect(
      applySkillInstallViewerAction({ kind: 'environment', value: 'missing-host' })
    ).rejects.toThrow('skill_environment_unavailable')
    await act(async () => {
      request = applySkillInstallViewerAction({ kind: 'scope', value: 'workspace' })
    })
    await expect(request).resolves.toMatchObject({ scope: 'workspace' })
    await act(async () => {
      request = applySkillInstallViewerAction({ kind: 'workspace', value: 'folder-1' })
    })
    await expect(request).resolves.toMatchObject({ workspace: 'folder-1' })
    expect(screen.getByRole('combobox', { name: 'Workspace' }).textContent).toContain(
      'Folder fixture'
    )
    await expect(
      applySkillInstallViewerAction({ kind: 'workspace', value: 'missing-workspace' })
    ).rejects.toThrow('skill_workspace_unavailable')
    await act(async () => {
      request = applySkillInstallViewerAction({ kind: 'environment', value: 'ssh:host-1' })
    })
    await expect(request).resolves.toMatchObject({
      environmentId: 'ssh:host-1',
      workspace: '',
      executionTarget: null
    })
    expect(screen.getByRole('combobox', { name: 'Machine' }).textContent).toContain('SSH fixture')
    await expect(
      applySkillInstallViewerAction({ kind: 'workspace', value: 'folder-1' })
    ).rejects.toThrow('skill_workspace_unavailable')
    await act(async () => {
      request = applySkillInstallViewerAction({ kind: 'environment', value: 'local' })
    })
    await expect(request).resolves.toMatchObject({ environmentId: 'local', workspace: '' })
    expect(skills.installShare).not.toHaveBeenCalled()
    expect(skills.previewInstall).not.toHaveBeenCalled()
    await expect(
      applySkillInstallViewerAction({ kind: 'link', value: 'replacement' })
    ).rejects.toThrow('skill_link_input_unavailable')
  })

  it('rejects edits during link inspection and releases its pending request on unmount', async () => {
    let finish!: (value: {
      status: 'ok'
      value: { id: string; version: SkillCloudVersion }
    }) => void
    const resolving = new Promise<{
      status: 'ok'
      value: { id: string; version: SkillCloudVersion }
    }>((resolve) => {
      finish = resolve
    })
    const skills = installApi(vi.fn())
    skills.resolveShare.mockReturnValue(resolving)
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { skills, preflight: detectionApi(['codex']) }
    })
    const view = render(<SkillInstallDialog open onOpenChange={() => undefined} />)
    let request: ReturnType<typeof applySkillInstallViewerAction> | undefined
    await act(async () => {
      request = applySkillInstallViewerAction({
        kind: 'link',
        value: 'https://app.orca.dev/skills/share/share_1'
      })
    })
    await request
    await act(async () => {
      request = applySkillInstallViewerAction({ kind: 'inspect' })
      request.catch(() => {})
    })
    await expect(applySkillInstallViewerAction({ kind: 'get' })).resolves.toMatchObject({
      busy: true,
      preview: null
    })
    await expect(
      applySkillInstallViewerAction({ kind: 'link', value: 'replacement' })
    ).rejects.toThrow('viewer_busy')
    view.unmount()
    await expect(request).rejects.toThrow('viewer_unmounted')
    await act(async () => {
      finish({ status: 'ok', value: { id: 'share_1', version: version() } })
    })
    await expect(applySkillInstallViewerAction({ kind: 'get' })).rejects.toThrow(
      'viewer_unavailable'
    )
    expect(skills.installShare).not.toHaveBeenCalled()
  })

  it('requires the existing conflict decision and installs the reviewed version', async () => {
    const skills = installApi(
      vi.fn().mockResolvedValue({
        status: 'ok',
        value: {
          name: 'private-skill',
          packageDigest: DIGEST,
          destinationIdentity: 'global:local',
          currentState: 'modified',
          providers: []
        }
      })
    )
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { skills, preflight: detectionApi(['codex']) }
    })
    render(<SkillInstallDialog open onOpenChange={() => undefined} />)
    let request: ReturnType<typeof applySkillInstallViewerAction> | undefined
    await act(async () => {
      request = applySkillInstallViewerAction({
        kind: 'link',
        value: 'https://app.orca.dev/skills/share/share_1'
      })
    })
    await request
    await act(async () => {
      request = applySkillInstallViewerAction({ kind: 'inspect' })
    })
    await request
    await expect(
      applySkillInstallViewerAction({ kind: 'install', discardLocal: true })
    ).rejects.toThrow('skill_conflict_decision_unavailable')
    await act(async () => {
      request = applySkillInstallViewerAction({ kind: 'install', discardLocal: false })
    })
    await expect(request).resolves.toMatchObject({
      destinationPreview: { currentState: 'modified' },
      result: null,
      busy: false
    })
    expect(skills.installShare).not.toHaveBeenCalled()
    expect(screen.getByText('Local copy needs a decision')).toBeTruthy()
    await act(async () => {
      request = applySkillInstallViewerAction({ kind: 'install', discardLocal: true })
    })
    await expect(request).resolves.toMatchObject({ result: { status: 'installed' }, busy: false })
    expect(skills.installShare).toHaveBeenCalledWith(
      expect.objectContaining({
        shareId: 'share_1',
        versionId: 'ver_1',
        providers: ['codex'],
        destination: { scope: 'global' },
        conflictResolution: 'replace-and-discard-local'
      })
    )
    await expect(
      applySkillInstallViewerAction({ kind: 'install', discardLocal: false })
    ).rejects.toThrow('skill_target_input_unavailable')
  })

  it('cancels only the active installation while its completion acknowledgement is pending', async () => {
    let finish!: (value: { status: 'ok'; value: SkillInstallResult }) => void
    const installing = new Promise<{ status: 'ok'; value: SkillInstallResult }>((resolve) => {
      finish = resolve
    })
    const skills = installApi(
      vi.fn().mockResolvedValue({
        status: 'ok',
        value: {
          name: 'private-skill',
          packageDigest: DIGEST,
          destinationIdentity: 'global:local',
          currentState: 'missing',
          providers: []
        }
      })
    )
    skills.installShare.mockReturnValue(installing)
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { skills, preflight: detectionApi(['codex']) }
    })
    render(<SkillInstallDialog open onOpenChange={() => undefined} />)
    let request: ReturnType<typeof applySkillInstallViewerAction> | undefined
    await act(async () => {
      request = applySkillInstallViewerAction({
        kind: 'link',
        value: 'https://app.orca.dev/skills/share/share_1'
      })
    })
    await request
    await act(async () => {
      request = applySkillInstallViewerAction({ kind: 'inspect' })
    })
    await request
    await expect(applySkillInstallViewerAction({ kind: 'cancel' })).rejects.toThrow(
      'skill_installation_not_active'
    )
    await act(async () => {
      request = applySkillInstallViewerAction({ kind: 'install', discardLocal: false })
    })
    const active = await applySkillInstallViewerAction({ kind: 'get' })
    expect(active.busy).toBe(true)
    expect(active.activeOperationId).toEqual(expect.any(String))
    const operationId = active.activeOperationId
    if (!operationId) {
      throw new Error('Expected active installation')
    }
    let cancellation: ReturnType<typeof applySkillInstallViewerAction> | undefined
    await act(async () => {
      cancellation = applySkillInstallViewerAction({ kind: 'cancel' })
    })
    await expect(cancellation).resolves.toMatchObject({
      busy: true,
      activeOperationId: active.activeOperationId
    })
    expect(skills.cancelInstall).toHaveBeenCalledExactlyOnceWith({
      operationId: active.activeOperationId
    })
    await act(async () => {
      finish({
        status: 'ok',
        value: {
          operationId,
          status: 'cancelled',
          name: 'private-skill',
          packageDigest: DIGEST,
          placements: []
        }
      })
    })
    await expect(request).resolves.toMatchObject({
      result: { status: 'cancelled' },
      busy: false,
      activeOperationId: null
    })
  })

  it('rejects an installation acknowledgement after the selected SSH owner reconnects', async () => {
    const connection = {
      targetId: 'host-1',
      status: 'connected' as const,
      error: null,
      reconnectAttempt: 0,
      connectionGeneration: 1
    }
    useAppStore.setState({
      sshTargetLabels: new Map([['host-1', 'SSH fixture']]),
      sshConnectionStates: new Map([['host-1', connection]])
    })
    let finish!: (value: { status: 'ok'; value: SkillInstallResult }) => void
    const installing = new Promise<{ status: 'ok'; value: SkillInstallResult }>((resolve) => {
      finish = resolve
    })
    const skills = installApi(
      vi.fn().mockResolvedValue({
        status: 'ok',
        value: {
          name: 'private-skill',
          packageDigest: DIGEST,
          destinationIdentity: 'global:ssh:host-1',
          currentState: 'missing',
          providers: []
        }
      })
    )
    skills.installShare.mockReturnValue(installing)
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { skills, preflight: detectionApi(['codex']) }
    })
    render(<SkillInstallDialog open onOpenChange={() => undefined} />)
    let request: ReturnType<typeof applySkillInstallViewerAction> | undefined
    await act(async () => {
      request = applySkillInstallViewerAction({
        kind: 'link',
        value: 'https://app.orca.dev/skills/share/share_1'
      })
    })
    await request
    await act(async () => {
      request = applySkillInstallViewerAction({ kind: 'inspect' })
    })
    await request
    await act(async () => {
      request = applySkillInstallViewerAction({ kind: 'environment', value: 'ssh:host-1' })
    })
    await request
    await act(async () => {
      request = applySkillInstallViewerAction({ kind: 'install', discardLocal: false })
      request.catch(() => {})
    })
    expect(skills.installShare).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: { scope: 'global', executionTarget: { kind: 'ssh', connectionId: 'host-1' } }
      })
    )
    await act(async () => {
      useAppStore.setState({
        sshConnectionStates: new Map([['host-1', { ...connection, connectionGeneration: 2 }]])
      })
    })
    await expect(request).rejects.toThrow('viewer_target_changed')
    await act(async () => {
      finish({
        status: 'ok',
        value: {
          operationId: 'old-operation',
          status: 'cancelled',
          name: 'private-skill',
          packageDigest: DIGEST,
          placements: []
        }
      })
    })
    expect(skills.installShare).toHaveBeenCalledTimes(1)
  })
})
