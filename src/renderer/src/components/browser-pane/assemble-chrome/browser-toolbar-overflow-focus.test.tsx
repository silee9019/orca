// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { BrowserChromeToolbar } from './browser-chrome-toolbar'
import { BrowserToolbarMenuDropdown } from './browser-toolbar-menu-dropdown'
import { ArtifactPublishButton } from '../../artifacts/ArtifactPublishButton'
import { TooltipProvider } from '../../ui/tooltip'
import { useAppStore } from '../../../store'
import type { BrowserChromeOverflowMenuProps } from './browser-chrome-folded-tools'

vi.mock('./use-browser-chrome-tool-fold', () => ({
  BROWSER_CHROME_FOLD_ORDER: ['share'],
  useBrowserChromeToolFold: () => new Set(['share'])
}))
vi.mock('./browser-navigation-control-row', () => ({
  BrowserNavigationControlRow: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  )
}))
vi.mock('../annotate/MarkupDrawButton', () => ({ MarkupDrawButton: () => null }))

const closeEvents: boolean[] = []
const createRequest = vi.fn(async () => {
  throw new Error('실제 artifact provider 호출 금지')
})
function Menu({ overflow }: { overflow: BrowserChromeOverflowMenuProps }) {
  const [open, setOpen] = useState(false)
  return (
    <BrowserToolbarMenuDropdown
      menuOpen={open}
      onMenuOpenChange={setOpen}
      allProfiles={[]}
      effectiveProfileId="default"
      onSwitchProfile={() => {}}
      onNewProfile={() => {}}
      detectedBrowsers={[]}
      onFetchDetectedBrowsers={() => {}}
      browserSessionImportState={null}
      onImportFromBrowser={() => {}}
      onImportFromFile={() => {}}
      viewportPresetId={null}
      onApplyViewportPreset={() => {}}
      overflow={{
        ...overflow,
        onMenuCloseAutoFocus: (event) => {
          overflow.onMenuCloseAutoFocus(event)
          closeEvents.push(event.defaultPrevented)
        }
      }}
    />
  )
}
function mountToolbar() {
  useAppStore.setState({ orcaProfileAuthStatus: null, settings: null })
  return render(
    <TooltipProvider>
      <BrowserChromeToolbar
        controls={{
          canGoBack: false,
          canGoForward: false,
          loading: false,
          goBack: () => {},
          goForward: () => {},
          reload: () => {},
          navigate: () => {}
        }}
        addressSlot={null}
        elementTools={null}
        markup={{ active: false, disabled: false, onToggle: () => {}, canShowDiscoveryHint: false }}
        viewSource={null}
        openExternal={null}
        shareControl={(control) => (
          <ArtifactPublishButton
            sourceKey="fixture-only"
            createRequest={createRequest}
            {...control}
          />
        )}
        overflowMenu={(overflow) => <Menu overflow={overflow} />}
      />
    </TooltipProvider>
  )
}
async function openMenu() {
  const trigger = screen.getByRole('button', { name: 'Browser menu' })
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' })
  await screen.findByRole('menu')
  return trigger
}
let previousStore = useAppStore.getState()
beforeEach(() => {
  previousStore = useAppStore.getState()
})
afterEach(() => {
  cleanup()
  useAppStore.setState({
    settings: previousStore.settings,
    orcaProfileAuthStatus: previousStore.orcaProfileAuthStatus
  })
  expect(useAppStore.getState().settings).toBe(previousStore.settings)
  expect(useAppStore.getState().orcaProfileAuthStatus).toBe(previousStore.orcaProfileAuthStatus)
  closeEvents.length = 0
  createRequest.mockClear()
})
it('leaves ordinary close focus to Radix without a deferred share action', async () => {
  mountToolbar()
  const trigger = await openMenu()
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  await waitFor(() => expect(document.activeElement).toBe(trigger))
  expect(closeEvents).toEqual([false])
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(createRequest).not.toHaveBeenCalled()
})
it('opens the actual artifact popover after folded share close and restores its DOM anchor on Escape', async () => {
  mountToolbar()
  const trigger = await openMenu()
  fireEvent.click(screen.getByRole('menuitem', { name: 'Share as artifact' }))
  const popover = await screen.findByRole('dialog')
  await waitFor(() => expect(document.activeElement).toBe(popover))
  expect(screen.queryByRole('menu')).toBeNull()
  expect(closeEvents).toEqual([true])
  expect(createRequest).not.toHaveBeenCalled()
  fireEvent.keyDown(popover, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  await waitFor(() => expect(document.activeElement).toBe(trigger))
  expect(createRequest).not.toHaveBeenCalled()
})
