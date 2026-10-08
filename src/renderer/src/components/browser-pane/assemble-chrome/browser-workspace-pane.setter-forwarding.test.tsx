// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import type { BrowserPage, BrowserWorkspace } from '../../../../../shared/browser-workspace-types'
import { installClientHostedPaneApi } from '../client-hosted-browser-pane-test-rig'

type State = ReturnType<typeof useAppStore.getState>
type Forwarded = {
  browserTab: BrowserPage
  onSetUrl: State['setBrowserPageUrl']
  onUpdatePageState: State['updateBrowserPageState']
}
const capture = vi.hoisted((): { branch: string; props: Forwarded | null } => ({
  branch: '',
  props: null
}))

vi.mock('@/components/contextual-tours/use-contextual-tour', () => ({
  useContextualTour: () => {}
}))
vi.mock('../host-guest/webview-registry', () => ({ destroyPersistentWebview: vi.fn() }))
vi.mock('./ssh-routed-browser-page-gate', () => ({
  SshRoutedBrowserPageGate: ({
    children
  }: {
    children: (partition: string | null) => React.ReactNode
  }) => <>{children(null)}</>
}))
vi.mock('./BrowserMobileDriverOverlay', () => ({ BrowserMobileDriverOverlay: () => null }))
vi.mock('./browser-page-pane', () => ({
  BrowserPagePane: (props: Forwarded) => {
    capture.branch = 'local'
    capture.props = props
    return null
  }
}))
vi.mock('../stream-remote/remote-browser-page-pane', () => ({
  RemoteBrowserPagePane: (props: Forwarded) => {
    capture.branch = 'remote'
    capture.props = props
    return null
  }
}))
vi.mock('../ClientHostedBrowserPagePane', () => ({
  ClientHostedBrowserPagePane: (props: Forwarded) => {
    capture.branch = 'client'
    capture.props = props
    return null
  }
}))

import BrowserPane from './browser-workspace-pane'

function page(environment?: string): BrowserPage {
  return {
    id: 'forward-page',
    workspaceId: 'forward-workspace',
    worktreeId: 'forward-worktree',
    url: 'about:blank',
    title: 'New Tab',
    loading: false,
    faviconUrl: null,
    canGoBack: false,
    canGoForward: false,
    loadError: null,
    createdAt: 1,
    ...(environment ? { browserRuntimeEnvironmentId: environment } : {})
  }
}

function workspace(): BrowserWorkspace {
  return {
    ...page(),
    id: 'forward-workspace',
    activePageId: 'forward-page',
    pageIds: ['forward-page']
  }
}

describe('BrowserPane store setter forwarding scope', () => {
  const original = useAppStore.getState()
  beforeEach(() => {
    installClientHostedPaneApi()
    capture.props = null
    capture.branch = ''
  })
  afterEach(() => {
    cleanup()
    useAppStore.setState(original, true)
  })

  it.each(['local', 'remote', 'client', 'staged-client', 'restored-client'])(
    'forwards actual store owners and applies page/workspace metadata for %s',
    (branch) => {
      const environmentId = 'forward-environment'
      const currentPage = page(branch === 'local' ? undefined : environmentId)
      const tab = workspace()
      useAppStore.setState({
        browserPagesByWorkspace: { [tab.id]: [currentPage] },
        browserTabsByWorktree: { [tab.worktreeId]: [tab] },
        remoteBrowserPageHandlesByPageId:
          branch === 'local'
            ? {}
            : {
                [currentPage.id]: {
                  environmentId,
                  remotePageId: 'forward-remote-page',
                  ...(branch === 'client'
                    ? {
                        placement: {
                          kind: 'client' as const,
                          browserHostClientId: 'fixture-client',
                          browserHostGeneration: 3,
                          pageHostGeneration: 7
                        }
                      }
                    : {}),
                  ...(branch === 'staged-client' ? { staged: true, stagedClientHosted: true } : {}),
                  ...(branch === 'restored-client' ? { restoredClientHosted: true } : {})
                }
              }
      })
      render(<BrowserPane browserTab={tab} isActive />)
      const forwarded = capture.props
      if (!forwarded) {
        throw new Error('No page pane mounted')
      }
      expect(capture.branch).toBe(branch.endsWith('client') ? 'client' : branch)
      expect(forwarded.onSetUrl).toBe(useAppStore.getState().setBrowserPageUrl)
      expect(forwarded.onUpdatePageState).toBe(useAppStore.getState().updateBrowserPageState)
      act(() => {
        forwarded.onSetUrl(currentPage.id, 'https://fixture.invalid/observed')
        forwarded.onUpdatePageState(currentPage.id, {
          title: 'Observed fixture',
          loading: false,
          canGoBack: true,
          canGoForward: true,
          faviconUrl: 'https://fixture.invalid/favicon',
          loadError: null
        })
      })
      const applied = useAppStore.getState()
      expect(applied.browserPagesByWorkspace[tab.id]?.[0]).toMatchObject({
        url: 'https://fixture.invalid/observed',
        title: 'Observed fixture',
        loading: false,
        canGoBack: true,
        canGoForward: true,
        faviconUrl: 'https://fixture.invalid/favicon'
      })
      expect(applied.browserTabsByWorktree[tab.worktreeId]?.[0]).toMatchObject({
        url: 'https://fixture.invalid/observed',
        title: 'Observed fixture',
        loading: false,
        canGoBack: true,
        canGoForward: true
      })
    }
  )
})
