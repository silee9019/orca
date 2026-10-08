// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { SkillInstallDialog } from './SkillInstallDialog'
import { SkillBundleInstallFlow } from './SkillBundleInstallFlow'
import { applySkillInstallViewerAction as install } from '../../runtime/skill-install-viewer-controller'
import { applySkillBundleViewerAction as bundle } from '../../runtime/skill-bundle-viewer-controller'
import { isSkillBundleVersion } from './skill-share-version-summary'
import { installApi, detectionApi, bundleVersion } from './skill-install-dialog-test-fixture'

beforeEach(() => {
  useAppStore.setState({
    runtimeEnvironments: [],
    runtimeStatusByEnvironmentId: new Map(),
    repos: [],
    worktreesByRepo: {},
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
    sshConnectionStates: new Map(),
    sshTargetLabels: new Map()
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'api')
})
it.each(['single', 'bundle'] as const)(
  'commits a %s workspace selection through the actual parent without invalidating its own target',
  async (kind) => {
    const skills = installApi(vi.fn())
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { skills, preflight: detectionApi(['codex']) }
    })
    if (kind === 'single') {
      render(
        <SkillInstallDialog
          open
          onOpenChange={() => undefined}
          initialLink="https://app.orca.dev/skills/share/share_1"
        />
      )
      await act(async () => {
        await Promise.resolve()
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    } else {
      const version = bundleVersion()
      if (!isSkillBundleVersion(version)) {
        throw new Error('missing bundle')
      }
      render(
        <SkillBundleInstallFlow
          shareId="share_1"
          version={version}
          onClose={() => undefined}
          onBusyChange={() => undefined}
        />
      )
    }
    const apply = kind === 'single' ? install : bundle
    expect((await apply({ kind: 'get' })).workspacePicker).toBeNull()
    await expect(apply({ kind: 'workspace-form', action: { kind: 'get' } })).rejects.toThrow(
      'viewer_unavailable'
    )
    let pending: ReturnType<typeof apply> | undefined
    await act(async () => {
      pending = apply({ kind: 'scope', value: 'workspace' })
    })
    const reviewedTarget = (await pending)?.workspacePicker?.reviewedTarget
    if (!reviewedTarget) {
      throw new Error('missing workspace picker')
    }
    await act(async () => {
      pending = apply({
        kind: 'workspace-form',
        action: { kind: 'open', reviewedTarget, value: true }
      })
    })
    expect((await pending)?.workspacePicker?.open).toBe(true)
    await act(async () => {
      pending = apply({
        kind: 'workspace-form',
        action: { kind: 'query', reviewedTarget, value: 'Folder fixture' }
      })
    })
    expect((await pending)?.workspacePicker?.visibleWorkspaceIds).toEqual(['folder-1'])
    await act(async () => {
      pending = apply({
        kind: 'workspace-form',
        action: { kind: 'choose', reviewedTarget, id: 'folder-1' }
      })
    })
    expect(await pending).toMatchObject({
      workspace: 'folder-1',
      workspacePicker: { value: 'folder-1', open: false, query: '', reviewedTarget }
    })
    expect(screen.getByRole('combobox', { name: 'Workspace' }).textContent).toContain(
      'Folder fixture'
    )
    await act(async () => {
      pending = apply({ kind: 'scope', value: 'global' })
    })
    await pending
    expect((await apply({ kind: 'get' })).workspacePicker).toBeNull()
    expect(skills.installShare).not.toHaveBeenCalled()
    expect(skills.installBundleShare).not.toHaveBeenCalled()
  }
)
