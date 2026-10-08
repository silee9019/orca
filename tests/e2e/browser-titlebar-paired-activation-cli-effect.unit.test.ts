// @vitest-environment happy-dom
import { createElement } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import '../../src/main/runtime/rpc/unused-default-rpc-methods.test-fixture'
import { OrcaRuntimeService } from '../../src/main/runtime/orca-runtime'
import { SESSION_TAB_MUTATION_METHODS } from '../../src/main/runtime/rpc/methods/session-tab-mutation-methods'
import type { RuntimeMobileSessionTabsResult } from '../../src/shared/runtime-types'
import { createRemotePaneCliSocket } from './browser-remote-pane-cli-socket.test-fixture'
import {
  PairedTitlebarFixture,
  seedPairedTitlebarTarget,
  clearPairedTitlebarTarget,
  titlebarWorktree
} from '../../src/renderer/src/components/browser-titlebar-paired-activation.test-fixture'
import { requestBrowserTitlebarPairedActivation } from '../../src/renderer/src/runtime/browser-titlebar-paired-activation-request'
import { BROWSER_TITLEBAR_PAIRED_ACTIVATION_COMMAND_SPECS } from '../../src/cli/specs/browser-titlebar-paired-activation'
import { BROWSER_TITLEBAR_PAIRED_ACTIVATION_HANDLERS } from '../../src/cli/handlers/browser-titlebar-paired-activation'
import { parseArgs, validateCommandAndFlags } from '../../src/cli/args'
import { useAppStore } from '../../src/renderer/src/store'
vi.mock('../../src/renderer/src/components/tab-bar/TabBar', () => ({ default: () => null }))
it('routes CLI and two sockets through actual mounted titlebar and host activation service with fake catalog readback', async () => {
  const initial = useAppStore.getState()
  const descriptor = Object.getOwnPropertyDescriptor(window, 'api')
  const target = seedPairedTitlebarTarget()
  const portal = document.createElement('div')
  document.body.append(portal)
  const snapshot: RuntimeMobileSessionTabsResult = {
    worktree: titlebarWorktree,
    publicationEpoch: 'fake-catalog',
    snapshotVersion: 1,
    activeGroupId: null,
    activeTabId: 'other',
    activeTabType: 'browser',
    tabs: [
      {
        type: 'browser',
        id: 'host-tab',
        title: 'Fixture',
        browserWorkspaceId: target.workspace,
        browserPageId: 'host-page',
        url: 'https://fixture.test/',
        loading: false,
        canGoBack: false,
        canGoForward: false,
        isActive: false
      }
    ]
  }
  const host = new OrcaRuntimeService()
  Reflect.set(host, 'mobileSessionTabsByWorktree', new Map([[titlebarWorktree, snapshot]]))
  Reflect.set(host, 'hydrateHeadlessMobileSessionTabsFromWorkspaceSession', () => {})
  Reflect.set(host, 'refreshMobileSessionPtyRecords', async () => {})
  Reflect.set(host, 'getMobileSessionTabsForWorktree', () => snapshot)
  const focus = vi.fn()
  host.setNotifier({ focusEditorTab: focus })
  const hostSocket = await createRemotePaneCliSocket(host, SESSION_TAB_MUTATION_METHODS)
  const calls: unknown[] = []
  Reflect.set(window.api, 'runtimeEnvironments', {
    call: async (args: {
      method: string
      params?: unknown
      selector: string
      expectedEnvironmentPairingRevision: number
    }) => {
      calls.push(args)
      return hostSocket.client.call(args.method, args.params)
    }
  })
  const viewer = new OrcaRuntimeService()
  viewer.setNotifier({
    browserViewer: async (command) => {
      if (command.operation !== 'titlebar-activate-paired') {
        throw new Error('unsupported fixture command')
      }
      return {
        applied: true,
        titlebarPairedActivation: await requestBrowserTitlebarPairedActivation(
          command.target,
          Date.now() + 2000
        )
      }
    }
  })
  const cli = await createRemotePaneCliSocket(viewer)
  const output = vi.spyOn(console, 'log').mockImplementation(() => {})
  render(createElement(PairedTitlebarFixture, { portal }))
  const run = async () => {
    const specs = BROWSER_TITLEBAR_PAIRED_ACTIVATION_COMMAND_SPECS
    const parsed = parseArgs(
      [
        'browser',
        'titlebar-activate-paired',
        '--viewer',
        'host',
        '--worktree',
        target.worktree,
        '--group',
        target.group,
        '--workspace',
        target.workspace,
        '--unified-tab',
        target.unifiedTab,
        '--page',
        target.page,
        '--remote-page',
        target.remotePageId,
        '--host-tab',
        target.hostTabId,
        '--runtime-environment',
        target.environmentId,
        '--execution-host',
        target.executionHostId,
        '--pairing-revision',
        '7',
        '--placement',
        'server'
      ],
      specs.map((spec) => spec.path),
      specs
    )
    validateCommandAndFlags(specs, parsed)
    await BROWSER_TITLEBAR_PAIRED_ACTIVATION_HANDLERS['browser titlebar-activate-paired']({
      ...parsed,
      client: cli.client,
      cwd: '.',
      json: true
    })
  }
  try {
    await act(async () => {
      await run()
    })
    expect(useAppStore.getState().activeBrowserTabIdByWorktree[titlebarWorktree]).toBe(
      target.workspace
    )
    expect(output.mock.lastCall?.[0]).toContain('"hostAcknowledged": true')
    expect(calls).toHaveLength(1)
    expect(snapshot.activeTabId).toBe('other')
    expect(focus).not.toHaveBeenCalled()
    cli.useLegacyPeer()
    await expect(run()).rejects.toMatchObject({ code: 'incompatible_runtime' })
    expect(calls).toHaveLength(1)
  } finally {
    cleanup()
    portal.remove()
    await cli.close()
    await hostSocket.close()
    clearPairedTitlebarTarget()
    useAppStore.setState(initial, true)
    output.mockRestore()
    if (descriptor) {
      Object.defineProperty(window, 'api', descriptor)
    } else {
      Reflect.deleteProperty(window, 'api')
    }
  }
})
