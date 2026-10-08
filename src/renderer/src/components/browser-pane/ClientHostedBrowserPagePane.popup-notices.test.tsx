// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Toaster, toast } from 'sonner'
import type * as SonnerModule from 'sonner'

const toastMocks = vi.hoisted(() => ({
  loading: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  message: vi.fn()
}))

vi.mock('sonner', async (importOriginal) => {
  const actual = await importOriginal<typeof SonnerModule>()
  toastMocks.message.mockImplementation(actual.toast.message)
  return { ...actual, toast: { ...actual.toast, ...toastMocks } }
})

import { useAppStore } from '@/store'
import { TooltipProvider } from '@/components/ui/tooltip'
import { installClientHostedPaneApi, paneChannel } from './client-hosted-browser-pane-test-rig'
import { ClientHostedBrowserPagePane } from './ClientHostedBrowserPagePane'

type PopupEvent = {
  browserPageId: string
  origin: string
  action: 'opened-in-orca' | 'opened-external' | 'blocked'
}

let popups = paneChannel<PopupEvent>()

let previousStore = useAppStore.getState()
let previousApi = Object.getOwnPropertyDescriptor(window, 'api')
beforeEach(() => {
  previousStore = useAppStore.getState()
  previousApi = Object.getOwnPropertyDescriptor(window, 'api')
  popups = paneChannel<PopupEvent>()
  installClientHostedPaneApi({ browser: { onPopup: popups.subscribe } })
})

afterEach(() => {
  act(() => {
    toast.dismiss()
  })
  cleanup()
  useAppStore.setState(previousStore, true)
  expect(useAppStore.getState()).toBe(previousStore)
  if (previousApi) {
    Object.defineProperty(window, 'api', previousApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
  vi.clearAllMocks()
})

function renderPane(): void {
  render(
    <TooltipProvider>
      <Toaster />
      <ClientHostedBrowserPagePane
        browserTab={
          {
            id: 'page-a',
            url: 'https://example.internal/app',
            title: 'App',
            loading: false,
            canGoBack: false,
            canGoForward: false
          } as never
        }
        workspaceId="workspace-a"
        chromeShortcutScope="focused"
        runtimeEnvironmentId="environment-a"
        worktreeId="worktree-a"
        placement={{
          kind: 'client',
          browserHostClientId: 'client-a',
          browserHostGeneration: 3,
          pageHostGeneration: 7
        }}
        isActive
        onUpdatePageState={vi.fn()}
        onSetUrl={vi.fn()}
      />
    </TooltipProvider>
  )
}

function emitPopup(overrides: Partial<PopupEvent> = {}): void {
  const event: PopupEvent = {
    browserPageId: 'page-a',
    origin: 'https://accounts.example.com',
    action: 'blocked',
    ...overrides
  }
  act(() => popups.emit(event))
}

describe('ClientHostedBrowserPagePane popup notices', () => {
  it('names the origin whose popup was refused', async () => {
    renderPane()

    emitPopup()

    expect(
      await screen.findByText(
        'https://accounts.example.com tried to open a popup Orca does not support here.'
      )
    ).not.toBeNull()
    expect(toastMocks.message).toHaveBeenCalledWith(
      'https://accounts.example.com tried to open a popup Orca does not support here.',
      { id: 'browser-popup:page-a:blocked:https://accounts.example.com' }
    )
  })

  it('silences in-Orca opens but reports external opens', async () => {
    renderPane()

    emitPopup({ action: 'opened-in-orca' })
    expect(toastMocks.message).not.toHaveBeenCalled()
    expect(document.querySelector('[data-sonner-toast]')).toBeNull()
    emitPopup({ action: 'opened-external' })
    expect(
      await screen.findByText(
        'https://accounts.example.com opened a new window in your default browser.'
      )
    ).not.toBeNull()
    expect(toastMocks.message).toHaveBeenCalledExactlyOnceWith(
      'https://accounts.example.com opened a new window in your default browser.',
      { id: 'browser-popup:page-a:opened-external:https://accounts.example.com' }
    )
  })

  it('ignores popups belonging to another page', () => {
    renderPane()

    emitPopup({ browserPageId: 'page-b' })

    expect(toastMocks.message).not.toHaveBeenCalled()
    expect(document.querySelector('[data-sonner-toast]')).toBeNull()
  })
})
