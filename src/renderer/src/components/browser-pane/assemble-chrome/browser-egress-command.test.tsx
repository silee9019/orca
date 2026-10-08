// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useAppStore } from '@/store'
import { BrowserEgressEvent, requestBrowserEgress } from '@/runtime/browser-egress-request'
import type { BrowserEgressCommand } from '../../../../../shared/rpc-contract/browser-egress-params'
import { seedBrowserOverlayFocusOwner } from './browser-overlay-focus.test-fixture'
import { RemoteRuntimeEgressIndicator, SshEgressIndicator } from './browser-egress-indicator'
const initial = useAppStore.getInitialState()
const previous = Object.getOwnPropertyDescriptor(window, 'api')
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
  if (previous) {
    Object.defineProperty(window, 'api', previous)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
const placement = {
  kind: 'client',
  browserHostClientId: 'client',
  browserHostGeneration: 2,
  pageHostGeneration: 3
} as const
const streamed: BrowserEgressCommand = {
  page: 'page',
  worktreeId: 'folder:fixture',
  target: { kind: 'streamed', environmentId: 'env', remotePageId: 'remote' },
  action: 'open'
}
const client: BrowserEgressCommand = {
  ...streamed,
  target: {
    kind: 'client',
    environmentId: 'env',
    clientTarget: {
      remotePageId: 'remote',
      browserHostClientId: 'client',
      browserHostGeneration: 2,
      pageHostGeneration: 3
    }
  }
}
function runtime(isClient = false) {
  seedBrowserOverlayFocusOwner()
  useAppStore.setState({
    remoteBrowserPageHandlesByPageId: {
      page: {
        environmentId: 'env',
        remotePageId: 'remote',
        placement: isClient ? placement : { kind: 'server' }
      }
    }
  })
  return render(
    <TooltipProvider>
      <RemoteRuntimeEgressIndicator
        runtimeEnvironmentId="env"
        presentation={isClient ? 'client-hosted' : 'streamed'}
        commandOwner={{
          page: 'page',
          isActive: true,
          clientPlacement: isClient ? placement : undefined
        }}
      />
    </TooltipProvider>
  )
}
async function begin(command: BrowserEgressCommand, expiresAt = Date.now() + 5000) {
  let pending: ReturnType<typeof requestBrowserEgress> | undefined
  await act(async () => {
    pending = requestBrowserEgress(command, expiresAt)
    void pending.catch(() => {})
  })
  if (!pending) {
    throw new Error('missing command')
  }
  return { pending }
}
it.each([false, true])(
  'uses the actual runtime popover and original settings owner client=%s',
  async (isClient) => {
    runtime(isClient)
    const command = isClient ? client : streamed
    expect(await (await begin(command)).pending).toMatchObject({
      open: true,
      settingsOpened: false
    })
    expect(screen.getByTestId('ssh-egress-indicator-settings')).not.toBeNull()
    expect(await (await begin({ ...command, action: 'close' })).pending).toMatchObject({
      open: false
    })
    expect(screen.queryByTestId('ssh-egress-indicator-settings')).toBeNull()
    expect(await (await begin({ ...command, action: 'settings' })).pending).toMatchObject({
      open: false,
      settingsOpened: true
    })
    expect(useAppStore.getState().activeView).toBe('settings')
    expect(useAppStore.getState().settingsNavigationTarget).toMatchObject({
      pane: 'browser',
      repoId: null,
      sectionId: 'browser-client-hosted-remote'
    })
  }
)
it.each([false, true])(
  'uses the SSH folder route and opt-out presentation routed=%s',
  async (routed) => {
    seedBrowserOverlayFocusOwner()
    const state = useAppStore.getState()
    if (!state.settings) {
      throw new Error('missing settings')
    }
    useAppStore.setState({
      activeWorkspaceExecutionHostId: 'ssh:target',
      folderWorkspaces: state.folderWorkspaces.map((folder) => ({
        ...folder,
        executionHostId: 'ssh:target'
      })),
      settings: { ...state.settings, browserSshWorkspaceRoutingEnabled: routed }
    })
    render(
      <TooltipProvider>
        <SshEgressIndicator
          worktreeId="folder:fixture"
          commandOwner={{ page: 'page', isActive: true }}
        />
      </TooltipProvider>
    )
    const target = {
      kind: 'ssh',
      executionHostId: 'ssh:target',
      egress: routed ? 'ssh' : 'local'
    } as const
    const command: BrowserEgressCommand = { ...streamed, target }
    expect(await (await begin(command)).pending).toMatchObject({ open: true })
    expect(screen.getByTestId('ssh-egress-indicator').getAttribute('data-egress')).toBe(
      routed ? 'ssh' : 'local'
    )
    await expect(
      (await begin({ ...command, target: { ...target, egress: routed ? 'local' : 'ssh' } })).pending
    ).rejects.toThrow('host_changed')
    expect(await (await begin({ ...command, action: 'settings' })).pending).toMatchObject({
      settingsOpened: true
    })
    expect(useAppStore.getState().settingsNavigationTarget?.sectionId).toBe(
      'browser-ssh-workspace-routing'
    )
  }
)
it('refuses the plain local globe without inventing a popover owner', async () => {
  seedBrowserOverlayFocusOwner()
  render(
    <TooltipProvider>
      <SshEgressIndicator
        worktreeId="folder:fixture"
        commandOwner={{ page: 'page', isActive: true }}
      />
    </TooltipProvider>
  )
  await expect(
    (
      await begin({
        ...streamed,
        target: { kind: 'ssh', executionHostId: 'ssh:target', egress: 'ssh' }
      })
    ).pending
  ).rejects.toThrow('owner_unavailable')
})
it.each([
  { staged: true as const },
  { restoredFromSession: true as const },
  { placement: { ...placement, pageHostGeneration: 4 } },
  { environmentId: 'other' },
  { remotePageId: 'other' }
])('refuses stale materialized client identity %j', async (change) => {
  runtime(true)
  const handle = useAppStore.getState().remoteBrowserPageHandlesByPageId.page
  useAppStore.setState({ remoteBrowserPageHandlesByPageId: { page: { ...handle, ...change } } })
  await expect((await begin(client)).pending).rejects.toThrow('client_changed')
  expect(screen.queryByTestId('ssh-egress-indicator-settings')).toBeNull()
})
it('refuses changed streamed targets and a busy modal before settings navigation', async () => {
  runtime()
  useAppStore.setState({ activeModal: 'create-worktree' })
  await expect((await begin({ ...streamed, action: 'settings' })).pending).rejects.toThrow(
    'target_changed'
  )
  expect(useAppStore.getState().activeView).toBe('terminal')
  useAppStore.setState({
    activeModal: 'none',
    remoteBrowserPageHandlesByPageId: {
      page: { environmentId: 'env', remotePageId: 'other', placement: { kind: 'server' } }
    }
  })
  await expect((await begin(streamed)).pending).rejects.toThrow('stream_changed')
})
it('rejects expiry and disposed offers before mutating the original owner', async () => {
  const view = runtime()
  await expect((await begin(streamed, Date.now() - 1)).pending).rejects.toThrow('expired')
  const event = new BrowserEgressEvent(streamed, Date.now() + 5000)
  window.dispatchEvent(event)
  view.unmount()
  await expect(event.offers[0]()).rejects.toThrow('disposed')
})
it('allows only one state transition before the same-act React commit', async () => {
  const view = runtime()
  let first: ReturnType<typeof requestBrowserEgress> | undefined
  let second: ReturnType<typeof requestBrowserEgress> | undefined
  await act(async () => {
    first = requestBrowserEgress(streamed, Date.now() + 5000)
    void first.catch(() => {})
    second = requestBrowserEgress(streamed, Date.now() + 5000)
    void second.catch(() => {})
  })
  await expect(first).resolves.toMatchObject({ open: true })
  await expect(second).rejects.toThrow('busy')
  let pending: ReturnType<typeof requestBrowserEgress> | undefined
  act(() => {
    pending = requestBrowserEgress({ ...streamed, action: 'close' }, Date.now() + 5000)
    void pending.catch(() => {})
    view.unmount()
  })
  await expect(pending).rejects.toThrow('disposed')
})
it('rejects an offered request after the rendered owner changes', async () => {
  const view = runtime()
  const event = new BrowserEgressEvent(streamed, Date.now() + 5000)
  window.dispatchEvent(event)
  view.rerender(
    <TooltipProvider>
      <RemoteRuntimeEgressIndicator
        runtimeEnvironmentId="other"
        presentation="streamed"
        commandOwner={{ page: 'page', isActive: true }}
      />
    </TooltipProvider>
  )
  await expect(event.offers[0]()).rejects.toThrow('owner_changed')
  expect(screen.queryByTestId('ssh-egress-indicator-settings')).toBeNull()
})
it('refuses ambiguous mounted owners without opening either popover', async () => {
  runtime()
  render(
    <TooltipProvider>
      <RemoteRuntimeEgressIndicator
        runtimeEnvironmentId="env"
        presentation="streamed"
        commandOwner={{ page: 'page', isActive: true }}
      />
    </TooltipProvider>
  )
  await expect((await begin(streamed)).pending).rejects.toThrow('owner_ambiguous')
  expect(screen.queryByTestId('ssh-egress-indicator-settings')).toBeNull()
})
it('refuses mixed-version streamed handles without authoritative placement', async () => {
  runtime()
  useAppStore.setState({
    remoteBrowserPageHandlesByPageId: { page: { environmentId: 'env', remotePageId: 'remote' } }
  })
  await expect((await begin({ ...streamed, action: 'settings' })).pending).rejects.toThrow(
    'stream_changed'
  )
  expect(useAppStore.getState().activeView).toBe('terminal')
})
it.each(['workspace', 'client-generation'] as const)(
  'never acknowledges pending open after same-act %s A-B-A',
  async (kind) => {
    runtime(true)
    const before = useAppStore.getState()
    let pending: ReturnType<typeof requestBrowserEgress> | undefined
    await act(async () => {
      pending = requestBrowserEgress(client, Date.now() + 5000)
      void pending.catch(() => {})
      if (kind === 'workspace') {
        useAppStore.setState({ activeWorktreeId: 'folder:other' })
        useAppStore.setState({ activeWorktreeId: 'folder:fixture' })
      } else {
        useAppStore.setState({
          remoteBrowserPageHandlesByPageId: {
            page: {
              environmentId: 'env',
              remotePageId: 'remote',
              placement: { ...placement, pageHostGeneration: 4 }
            }
          }
        })
        useAppStore.setState({
          remoteBrowserPageHandlesByPageId: before.remoteBrowserPageHandlesByPageId
        })
      }
    })
    await expect(pending).rejects.toThrow(
      kind === 'workspace' ? 'target_changed' : 'client_changed'
    )
  }
)
it('invalidates pending open across actual active owner commits', async () => {
  const view = runtime()
  let pending: ReturnType<typeof requestBrowserEgress> | undefined
  act(() => {
    pending = requestBrowserEgress(streamed, Date.now() + 5000)
    void pending.catch(() => {})
    view.rerender(
      <TooltipProvider>
        <RemoteRuntimeEgressIndicator
          runtimeEnvironmentId="env"
          presentation="streamed"
          commandOwner={{ page: 'page', isActive: false }}
        />
      </TooltipProvider>
    )
  })
  view.rerender(
    <TooltipProvider>
      <RemoteRuntimeEgressIndicator
        runtimeEnvironmentId="env"
        presentation="streamed"
        commandOwner={{ page: 'page', isActive: true }}
      />
    </TooltipProvider>
  )
  await expect(pending).rejects.toThrow('target_changed')
})

it('preserves the existing settings button callback and closes the actual popover', async () => {
  runtime()
  await (
    await begin(streamed)
  ).pending
  act(() => fireEvent.click(screen.getByTestId('ssh-egress-indicator-settings')))
  expect(screen.queryByTestId('ssh-egress-indicator-settings')).toBeNull()
  expect(useAppStore.getState().activeView).toBe('settings')
  expect(useAppStore.getState().settingsNavigationTarget).toMatchObject({
    pane: 'browser',
    repoId: null,
    sectionId: 'browser-client-hosted-remote'
  })
})
