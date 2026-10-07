// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { fixture, setup, command, ipcFixture } from './usage-cli-test-fixture'
import { buildRegistry, isStreamingMethod } from '../../src/main/runtime/rpc/core'
import { USAGE_VIEWER_METHODS } from '../../src/main/runtime/rpc/methods/usage-viewer'
import { ACCOUNT_VIEWER_RESPONSE_CHANNEL } from '../../src/shared/account-viewer-contract'

const desktop = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock('../../src/main/ipc/ui', () => ({ getTrustedUIRendererWebContents: () => desktop }))

describe('public usage viewer command', () => {
  it('routes the parser through real RPC/request ack and existing renderer filter setters', async () => {
    const { client, runtime, providers } = setup()
    await runtime.getUsageController().setEnabled('codex', true)
    const clipboard = vi.fn(async () => {})
    const snapshot = vi.fn(async (params) =>
      runtime.getUsageController().getSnapshot('codex', params.scope, params.range)
    )
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        ui: { set: vi.fn(async () => {}), writeClipboardText: clipboard },
        codexUsage: {
          getScanState: async () => providers.codex.getScanState(),
          getSnapshot: snapshot,
          setEnabled: async ({ enabled }: { enabled: boolean }) =>
            runtime.getUsageController().setEnabled('codex', enabled),
          refresh: async () => runtime.getUsageController().refresh('codex', false)
        }
      }
    })
    const { useAppStore } = await import('../../src/renderer/src/store')
    const { applyUsageViewerAction } =
      await import('../../src/renderer/src/runtime/usage-viewer-actions')
    const registry = buildRegistry(USAGE_VIEWER_METHODS)
    desktop.send.mockImplementation((_channel, request) => {
      const listener = vi
        .mocked(ipcFixture.on)
        .mock.calls.findLast((call) => call[0] === ACCOUNT_VIEWER_RESPONSE_CHANNEL)?.[1]
      if (!listener) {
        throw new Error('missing_ack_listener')
      }
      void applyUsageViewerAction(request.command.action).then(
        (result) =>
          listener({ sender: desktop }, { requestId: request.requestId, ok: true, result }),
        (error) =>
          listener(
            { sender: desktop },
            {
              requestId: request.requestId,
              ok: false,
              error: error instanceof Error ? error.message : 'fixture_viewer_error'
            }
          )
      )
    })
    vi.mocked(client.call).mockImplementation(async (name, params) => {
      const method = registry.get(name)
      if (!method || isStreamingMethod(method)) {
        throw new Error('missing_viewer_method')
      }
      const result = await method.handler(method.params.parse(params), { runtime })
      return { id: 'fixture', ok: true, result, _meta: { runtimeId: 'fixture-host' } }
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    await command(client, [
      'usage',
      'set-filters',
      '--viewer',
      'desktop',
      '--provider',
      'codex',
      '--scope',
      'all',
      '--range',
      '7d'
    ])
    expect(useAppStore.getState().codexUsageScope).toBe('all')
    expect(useAppStore.getState().codexUsageRange).toBe('7d')
    expect(snapshot).toHaveBeenLastCalledWith({ scope: 'all', range: '7d', limit: 10 })
    expect(ipcFixture.removeListener).toHaveBeenCalledWith(
      ACCOUNT_VIEWER_RESPONSE_CHANNEL,
      expect.any(Function)
    )
    const accountsViewer =
      await import('../../src/renderer/src/runtime/usage-account-viewer-controller')
    let finishSignIn: (value: boolean) => void = () => {}
    const cancelSignIn = vi.fn(async () => true)
    const removeSignIn = accountsViewer.registerFeatureWallUsageAccounts('codex', {
      busy: () => false,
      cancel: cancelSignIn,
      signIn: () =>
        new Promise<boolean>((resolve) => {
          finishSignIn = resolve
        })
    })
    await command(client, [
      'usage',
      'feature-wall-signin',
      '--viewer',
      'desktop',
      '--provider',
      'codex'
    ])
    const signInResult = await vi.mocked(client.call).mock.results.at(-1)?.value
    const signInReceipt = signInResult.result
    expect(signInReceipt.status).toBe('pending')
    await command(client, [
      'usage',
      'feature-wall-signin-cancel',
      '--viewer',
      'desktop',
      '--provider',
      'codex',
      '--operation-id',
      signInReceipt.operationId
    ])
    expect(cancelSignIn).toHaveBeenCalledOnce()
    expect(
      accountsViewer.readFeatureWallUsageSignIn('codex', signInReceipt.operationId).status
    ).toBe('pending')
    finishSignIn(false)
    await Promise.resolve()
    await command(client, [
      'usage',
      'feature-wall-signin-status',
      '--viewer',
      'desktop',
      '--provider',
      'codex',
      '--operation-id',
      signInReceipt.operationId
    ])
    expect(
      accountsViewer.readFeatureWallUsageSignIn('codex', signInReceipt.operationId).status
    ).toBe('failed')
    removeSignIn()
    const refreshAccountState = vi.fn(async () => {})
    const removeRefresh = accountsViewer.registerUsageAccountStateRefresh(refreshAccountState)
    await command(client, ['usage', 'refresh-account-state', '--viewer', 'desktop'])
    expect(refreshAccountState).toHaveBeenCalledOnce()
    removeRefresh()
    await command(client, ['usage', 'select-tab', '--viewer', 'desktop', '--tab-id', 'muse'])
    const { useUsageTabSelection } =
      await import('../../src/renderer/src/runtime/usage-tab-selection')
    expect(useUsageTabSelection.getState().activeUsageTab).toBe('muse')
    expect(useAppStore.getState().activeView).toBe('settings')
    expect(useAppStore.getState().settingsNavigationTarget).toEqual({ pane: 'stats', repoId: null })
    await command(client, ['usage', 'set-display-mode', '--viewer', 'desktop', '--mode', 'compact'])
    expect(useAppStore.getState().statusBarUsageMode).toBe('compact')
    await command(client, [
      'usage',
      'dismiss-notice',
      '--viewer',
      'desktop',
      '--notice',
      'empty-usage'
    ])
    expect(useAppStore.getState().usageEmptyStateDismissed).toBe(true)
    await command(client, [
      'usage',
      'dismiss-notice',
      '--viewer',
      'desktop',
      '--notice',
      'percentage-display'
    ])
    expect(useAppStore.getState().usagePercentageDisplayChangeNoticeDismissed).toBe(true)
    await command(client, [
      'usage',
      'viewer-set-enabled',
      '--viewer',
      'desktop',
      '--provider',
      'codex',
      '--enabled',
      'false'
    ])
    expect(useAppStore.getState().codexUsageScanState?.enabled).toBe(false)
    expect(providers.codex.getScanState().enabled).toBe(false)
    await command(client, [
      'usage',
      'viewer-set-enabled',
      '--viewer',
      'desktop',
      '--provider',
      'codex',
      '--enabled',
      'true'
    ])
    expect(useAppStore.getState().codexUsageScanState?.enabled).toBe(true)
    expect(providers.codex.getScanState().enabled).toBe(true)
    await command(client, ['usage', 'viewer-refresh', '--viewer', 'desktop', '--provider', 'codex'])
    expect(useAppStore.getState().codexUsageScanState?.lastScanCompletedAt).toEqual(
      expect.any(Number)
    )
    await command(client, [
      'usage',
      'viewer-refresh',
      '--viewer',
      'desktop',
      '--provider',
      'overview'
    ])
    useAppStore.setState({ persistedUIReady: true })
    const previousCount =
      useAppStore.getState().featureInteractions['usage-tracking']?.interactionCount ?? 0
    await command(client, ['usage', 'record-interaction', '--viewer', 'desktop'])
    expect(useAppStore.getState().featureInteractions['usage-tracking']?.interactionCount).toBe(
      previousCount + 1
    )
    await command(client, ['usage', 'percentage-settings', '--viewer', 'desktop'])
    expect(useAppStore.getState().settingsNavigationTarget?.pane).toBe('appearance')
    expect(useAppStore.getState().settingsNavigationTarget?.sectionId).toBe(
      'usage-percentage-display'
    )
    const { createElement } = await import('react')
    const { render, act, cleanup } = await import('@testing-library/react')
    const { NativeChatContextUsageRing } =
      await import('../../src/renderer/src/components/native-chat/NativeChatContextUsageRing')
    const { SkillUsageExamplesSection } =
      await import('../../src/renderer/src/components/settings/SkillUsageExamplesSection')
    const { Bot } = await import('lucide-react')
    render(
      createElement(NativeChatContextUsageRing, {
        target: { kind: 'session', id: 'fixture-session' },
        usage: { usedTokens: 10, windowTokens: 100, percentage: 10, estimated: false, rows: [] }
      })
    )
    render(
      createElement(SkillUsageExamplesSection, {
        heading: 'Fixture examples',
        description: 'Fixture description',
        slashCommand: '/fixture',
        examples: [
          {
            id: 'example-1',
            title: 'Fixture example',
            summary: 'Fixture summary',
            prompt: '/fixture safe prompt'
          }
        ],
        resolveIcon: () => Bot
      })
    )
    async function mountedCommand(argv: string[]) {
      let pending: Promise<void> | undefined
      act(() => {
        pending = command(client, argv)
      })
      await pending
    }
    try {
      await mountedCommand([
        'usage',
        'set-context-open',
        '--viewer',
        'desktop',
        '--session-id',
        'fixture-session',
        '--open',
        'true'
      ])
      expect(
        document
          .querySelector('button[data-native-chat-context-usage]')
          ?.getAttribute('aria-expanded')
      ).toBe('true')
      await mountedCommand([
        'usage',
        'set-context-open',
        '--viewer',
        'desktop',
        '--session-id',
        'fixture-session',
        '--open',
        'false'
      ])
      expect(
        document
          .querySelector('button[data-native-chat-context-usage]')
          ?.getAttribute('aria-expanded')
      ).toBe('false')
      await mountedCommand([
        'usage',
        'skill-example',
        '--viewer',
        'desktop',
        '--skill-command',
        '/fixture',
        '--example-id',
        'example-1',
        '--operation',
        'open'
      ])
      expect(document.querySelector('[data-slot="dialog-content"]')?.textContent).toContain(
        'Fixture summary'
      )
      await command(client, [
        'usage',
        'skill-example',
        '--viewer',
        'desktop',
        '--skill-command',
        '/fixture',
        '--example-id',
        'example-1',
        '--operation',
        'copy'
      ])
      expect(clipboard).toHaveBeenCalledExactlyOnceWith('/fixture safe prompt')
      await mountedCommand([
        'usage',
        'skill-example',
        '--viewer',
        'desktop',
        '--skill-command',
        '/fixture',
        '--example-id',
        'example-1',
        '--operation',
        'close'
      ])
      expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull()
    } finally {
      cleanup()
    }
    await expect(
      command(client, [
        'usage',
        'set-context-open',
        '--viewer',
        'desktop',
        '--session-id',
        'fixture-session',
        '--open',
        'true'
      ])
    ).rejects.toThrow('native_context_viewer_unavailable')
    await expect(
      command(client, [
        'usage',
        'skill-example',
        '--viewer',
        'desktop',
        '--skill-command',
        '/fixture',
        '--example-id',
        'example-1',
        '--operation',
        'copy'
      ])
    ).rejects.toThrow('skill_example_viewer_unavailable')
    desktop.send.mockImplementation((_channel, request) => {
      const listener = ipcFixture.on.mock.calls.findLast(
        (call) => call[0] === ACCOUNT_VIEWER_RESPONSE_CHANNEL
      )?.[1]
      if (!listener) {
        throw new Error('missing_ack_listener')
      }
      listener(
        { sender: desktop },
        { requestId: request.requestId, ok: true, result: { tab: 'claude' } }
      )
    })
    await expect(
      command(client, ['usage', 'select-tab', '--viewer', 'desktop', '--tab-id', 'muse'])
    ).rejects.toThrow()
    expect(fixture.directory).toContain('orca-usage-cli-')
  })
})
