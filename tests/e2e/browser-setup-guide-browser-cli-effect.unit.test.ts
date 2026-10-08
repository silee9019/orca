// @vitest-environment happy-dom
import * as desktopWindowChrome from '../../src/renderer/src/lib/desktop-window-chrome'
import { requestBrowserSetupGuide } from '../../src/renderer/src/runtime/browser-setup-guide-request'
import { act, createElement } from 'react'
import { linkedWorkspace } from './linked-browser-owner.fixture'
import { expect, it, vi } from 'vitest'
import { browserSetupGuideOwnerSocketFixture } from './browser-setup-guide-owner-socket.fixture'
import { useAppStore } from '../../src/renderer/src/store'
vi.mock('../../src/renderer/src/components/onboarding/OnboardingInlineCommandTerminal', () => ({
  OnboardingInlineCommandTerminal: () => createElement('div', { 'data-fake-setup-terminal': true })
}))
vi.mock('../../src/cli/runtime/launch', () => ({
  launchOrcaApp: () => {
    throw new Error('Fixture refuses app launch')
  }
}))
it.skipIf(process.platform === 'win32')(
  'reuses the original Try it out project prompt through CLI/socket without creating a browser',
  async () => {
    const fixture = await browserSetupGuideOwnerSocketFixture()
    try {
      await fixture.renderOwner(1, false)
      await fixture.invoke('try-it', undefined, 'modal', [
        '--target-workspace',
        'none',
        '--group',
        'none'
      ])
      expect(useAppStore.getState().activeModal).toBe('add-repo')
      expect(useAppStore.getState().browserTabsByWorktree).toEqual({})
      expect(
        fixture.store.getUI().featureInteractions?.['workspace-creation']?.interactionCount
      ).toBe(1)
      expect(
        JSON.parse(fixture.output.mock.calls.at(-1)?.[0]).result.browserSetupGuide
      ).toMatchObject({
        projectPrompted: true,
        browserOpened: false
      })
      expect(fixture.writeClipboardText).not.toHaveBeenCalled()
    } finally {
      await fixture.close()
    }
  }
)

it.skipIf(process.platform === 'win32')(
  'activates the fallback workspace and reuses actual browser creation with exact group/profile/home/address intent',
  async () => {
    const fixture = await browserSetupGuideOwnerSocketFixture()
    try {
      await act(async () => {
        useAppStore.setState({
          worktreesByRepo: { [linkedWorkspace.repoId]: [linkedWorkspace] },
          repos: [
            {
              id: linkedWorkspace.repoId,
              path: '/fixture/repo',
              displayName: 'Fixture',
              badgeColor: 'muted',
              addedAt: 0
            }
          ],
          browserTabsByWorktree: {},
          browserPagesByWorkspace: {},
          unifiedTabsByWorktree: {},
          groupsByWorktree: {},
          activeGroupIdByWorktree: {},
          browserDefaultUrl: 'https://private-fixture.invalid/home',
          defaultBrowserSessionProfileId: 'private-profile'
        })
        useAppStore.getState().ensureWorktreeRootGroup(linkedWorkspace.id)
      })
      await fixture.renderOwner(1, false)
      const group = useAppStore.getState().groupsByWorktree[linkedWorkspace.id][0].id
      await expect(
        fixture.invoke('try-it', undefined, 'modal', [
          '--target-workspace',
          linkedWorkspace.id,
          '--group',
          'wrong-group'
        ])
      ).rejects.toThrow('group_mismatch')
      expect(useAppStore.getState().activeModal).toBe('setup-guide')
      expect(useAppStore.getState().browserTabsByWorktree[linkedWorkspace.id]).toBeUndefined()
      vi.mocked(window.api.gh.enqueuePRRefresh).mockImplementationOnce(() => {
        throw new Error('private-activation-provider-failure')
      })
      await expect(
        fixture.invoke('try-it', undefined, 'modal', [
          '--target-workspace',
          linkedWorkspace.id,
          '--group',
          group
        ])
      ).rejects.toThrow('effect_unknown')
      expect(useAppStore.getState().browserTabsByWorktree[linkedWorkspace.id]).toBeUndefined()
      await act(async () =>
        useAppStore.setState({ activeWorktreeId: null, activeModal: 'setup-guide' })
      )
      await fixture.invoke('try-it', undefined, 'modal', [
        '--target-workspace',
        linkedWorkspace.id,
        '--group',
        group
      ])
      const state = useAppStore.getState()
      const tab = state.browserTabsByWorktree[linkedWorkspace.id][0]
      const page = state.browserPagesByWorkspace[tab.id][0]
      expect(state.activeModal).toBe('none')
      expect(state.activeView).toBe('terminal')
      expect(state.activeWorktreeId).toBe(linkedWorkspace.id)
      expect(state.activeBrowserTabId).toBe(tab.id)
      expect(tab.sessionProfileId).toBe('private-profile')
      expect(page.url).toBe('https://private-fixture.invalid/home')
      expect(state.pendingAddressBarFocusByPageId[page.id]).toBe(true)
      expect(
        state.unifiedTabsByWorktree[linkedWorkspace.id].find((t) => t.entityId === tab.id)?.groupId
      ).toBe(group)
      expect(
        JSON.parse(fixture.output.mock.calls.at(-1)?.[0]).result.browserSetupGuide
      ).toMatchObject({ browserOpened: true, projectPrompted: false })
      expect(fixture.output.mock.calls.at(-1)?.[0]).not.toContain('private-')
      const createBrowser = useAppStore.getState().createBrowserTab
      await act(async () => {
        useAppStore.setState({
          activeWorktreeId: null,
          activeModal: 'setup-guide',
          createBrowserTab: () => {
            throw new Error('private-create-failure')
          }
        })
        const operation = requestBrowserSetupGuide(
          {
            action: 'try-it',
            runtime: 'local',
            surface: 'modal',
            workspaceId: null,
            targetWorkspaceId: linkedWorkspace.id,
            groupId: group
          },
          Date.now() + 3000
        )
        useAppStore.setState({ createBrowserTab: createBrowser })
        createBrowser(linkedWorkspace.id, 'https://private-fixture.invalid/home', {
          targetGroupId: group,
          focusAddressBar: true
        })
        await expect(operation).rejects.toThrow('effect_unknown')
      })
      expect(useAppStore.getState().browserTabsByWorktree[linkedWorkspace.id]).toHaveLength(2)
    } finally {
      await fixture.close()
    }
  }
)

it.skipIf(process.platform === 'win32')(
  'rejects unavailable, duplicate, mismatched, paired and expired Try it out requests before effects',
  async () => {
    const fixture = await browserSetupGuideOwnerSocketFixture()
    const flags = ['--target-workspace', 'none', '--group', 'none']
    try {
      await expect(fixture.invoke('try-it', undefined, 'modal', flags)).rejects.toThrow(
        'try_unavailable'
      )
      await fixture.renderOwner(2, false)
      await expect(fixture.invoke('try-it', undefined, 'modal', flags)).rejects.toThrow(
        'owner_ambiguous'
      )
      await fixture.renderOwner(1, false)
      await expect(
        fixture.invoke('try-it', undefined, 'modal', [
          '--target-workspace',
          'other',
          '--group',
          'none'
        ])
      ).rejects.toThrow('target_mismatch')
      const paired = vi.spyOn(desktopWindowChrome, 'isPairedWebClientWindow').mockReturnValue(true)
      try {
        await expect(fixture.invoke('try-it', undefined, 'modal', flags)).rejects.toThrow(
          'provider_unavailable'
        )
      } finally {
        paired.mockRestore()
      }
      await expect(
        requestBrowserSetupGuide(
          {
            action: 'try-it',
            runtime: 'local',
            surface: 'modal',
            workspaceId: null,
            targetWorkspaceId: null,
            groupId: null
          },
          Date.now() - 1
        )
      ).rejects.toThrow('expired')
      expect(useAppStore.getState().activeModal).toBe('setup-guide')
      expect(fixture.recordInteraction).not.toHaveBeenCalled()
      expect(fixture.writeClipboardText).not.toHaveBeenCalled()
    } finally {
      await fixture.close()
    }
  }
)

it.skipIf(process.platform === 'win32')(
  'does not acknowledge a prompt that another modal supersedes before completion',
  async () => {
    const fixture = await browserSetupGuideOwnerSocketFixture()
    try {
      await fixture.renderOwner(1, false)
      await act(async () => {
        const operation = requestBrowserSetupGuide(
          {
            action: 'try-it',
            runtime: 'local',
            surface: 'modal',
            workspaceId: null,
            targetWorkspaceId: null,
            groupId: null
          },
          Date.now() + 3000
        )
        useAppStore.setState({ activeModal: 'quick-open' })
        await expect(operation).rejects.toThrow('effect_unknown')
      })
      expect(useAppStore.getState().activeModal).toBe('quick-open')
      expect(
        fixture.store.getUI().featureInteractions?.['workspace-creation']?.interactionCount
      ).toBe(1)
      expect(fixture.output).not.toHaveBeenCalled()
    } finally {
      await fixture.close()
    }
  }
)
