import type { ComponentProps } from 'react'
import { TooltipProvider } from '../../ui/tooltip'
import type { seedBrowserOverlayFocusOwner } from './browser-overlay-focus.test-fixture'
import { BrowserPageToolbar } from './browser-page-toolbar'
const url = 'https://fixture.invalid/toolbar'
export function NativeToolbarFixture({
  target,
  active = true,
  externalUrl = url,
  history,
  page = 'page'
}: {
  target: ReturnType<typeof seedBrowserOverlayFocusOwner>
  active?: boolean
  page?: string
  externalUrl?: string
  history?: Pick<
    ComponentProps<typeof BrowserPageToolbar>,
    'webviewRef' | 'convertedFrom' | 'convertedTo'
  >
}) {
  return (
    <TooltipProvider>
      <BrowserPageToolbar
        browserPageId={page}
        workspaceId={target.workspaceId}
        worktreeId={target.worktreeId}
        sessionProfileId={null}
        viewportPresetId={null}
        isActive={active}
        canGoBack={false}
        canGoForward={false}
        loading={false}
        webviewRef={{ current: null }}
        reloadMenuOpen={false}
        setReloadMenuOpen={() => {}}
        reloadButtonLabel="Reload"
        reloadButtonLabelKind="reload"
        reloadShortcut=""
        hardReloadShortcut=""
        runReloadTrigger={() => {}}
        addressBarValue={url}
        setAddressBarValue={() => {}}
        submitAddressBar={() => {}}
        navigateToUrl={() => {}}
        addressBarInputRef={{ current: null }}
        dismissAddressBarSuggestionsRef={{ current: null }}
        grab={{
          state: 'idle',
          payload: null,
          error: null,
          contextMenu: false,
          toggle: () => {},
          cancel: () => {},
          rearm: () => {},
          exit: () => {}
        }}
        grabIntent="copy"
        startGrabIntent={() => {}}
        isBlankTab={false}
        markupIsActive={false}
        markupStart={async () => {}}
        markupCancel={() => {}}
        grabElementShortcut=""
        browserAnnotationsLength={0}
        shareableArtifactFile={null}
        currentBrowserUrl={url}
        externalUrl={externalUrl}
        {...history}
      />
    </TooltipProvider>
  )
}
