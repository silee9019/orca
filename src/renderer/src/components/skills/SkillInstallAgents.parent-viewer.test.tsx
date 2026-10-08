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
it.each(['single', 'bundle'] as const)(
  'routes %s agent choices through the actual parent without installing',
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
    const before = await apply({ kind: 'get' })
    const reviewedTarget = before.agents?.reviewedTarget
    if (!reviewedTarget) {
      throw new Error('missing agent picker')
    }
    let pending: ReturnType<typeof apply> | undefined
    await act(async () => {
      pending = apply({
        kind: 'agents-form',
        action: { kind: 'open', reviewedTarget, value: true }
      })
    })
    expect((await pending)?.agents?.open).toBe(true)
    await act(async () => {
      pending = apply({
        kind: 'agents-form',
        action: { kind: 'provider', reviewedTarget, provider: 'cursor', checked: true }
      })
    })
    expect((await pending)?.providers).toContain('cursor')
    expect(screen.getByRole('checkbox', { name: 'Cursor' }).getAttribute('data-state')).toBe(
      'checked'
    )
    await act(async () => {
      pending = apply({ kind: 'scope', value: 'workspace' })
    })
    const after = await pending
    expect(after?.agents?.reviewedTarget).not.toBe(reviewedTarget)
    await expect(
      apply({
        kind: 'agents-form',
        action: { kind: 'provider', reviewedTarget, provider: 'claude', checked: true }
      })
    ).rejects.toThrow('viewer_target_changed')
    expect(skills.installShare).not.toHaveBeenCalled()
    expect(skills.installBundleShare).not.toHaveBeenCalled()
  }
)
