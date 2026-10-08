// @vitest-environment happy-dom
import { useRef, useState, type ReactNode } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { useAppStore } from '@/store'
import { getDefaultSettings } from '../../../../../shared/constants'
import { requestBrowserAddress } from '@/runtime/browser-address-request'
import type {
  BrowserAddressCommand,
  BrowserAddressState
} from '../../../../../shared/rpc-contract/browser-address-params'
import { BrowserPageToolbar } from './browser-page-toolbar'
import { installClientHostedPaneApi } from '../client-hosted-browser-pane-test-rig'
vi.mock('@/hooks/useShortcutLabel', () => ({ useShortcutLabel: () => '' }))
vi.mock('./browser-chrome-toolbar', () => ({
  BrowserChromeToolbar: ({ addressSlot }: { addressSlot: ReactNode }) => <>{addressSlot}</>
}))
const initial = useAppStore.getState()
const previousApi = Object.getOwnPropertyDescriptor(window, 'api')
let pageId = '',
  workspaceId = ''
const location = {
  kind: 'workspace-doc' as const,
  worktreeId: 'folder-fixture',
  filePath: join(tmpdir(), 'toolbar-report.html')
}
beforeEach(() => {
  installClientHostedPaneApi()
  useAppStore.setState({
    settings: getDefaultSettings(tmpdir()),
    activeWorktreeId: 'folder-fixture',
    persistedUIReady: true,
    activeView: 'terminal',
    activeModal: 'none'
  })
  const workspace = useAppStore
    .getState()
    .createBrowserTab('folder-fixture', 'https://before.invalid', {
      browserRuntimeEnvironmentId: null
    })
  workspaceId = workspace.id
  pageId = useAppStore.getState().browserPagesByWorkspace[workspaceId][0].id
  useAppStore.setState({
    workspaceDocHistory: [
      { docLocation: location, title: 'Report', lastVisitedAt: 3, visitCount: 1 }
    ]
  })
})
afterEach(() => {
  cleanup()
  useAppStore.setState(initial, true)
  if (previousApi) {
    Object.defineProperty(window, 'api', previousApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
async function command(value: BrowserAddressCommand): Promise<BrowserAddressState> {
  let pending: Promise<BrowserAddressState> | undefined
  await act(async () => {
    pending = requestBrowserAddress(pageId, value, Date.now() + 5000)
    void pending.catch(() => {})
  })
  if (!pending) {
    throw new Error('missing request')
  }
  return pending
}
it('routes the actual toolbar document selection through the existing conversion store writer', async () => {
  render(<ToolbarOwner />)
  const draft = await command({ action: 'draft', text: '' })
  const row = draft.suggestions.find((entry) => entry.kind === 'workspace-doc')
  if (!row) {
    throw new Error('missing document suggestion')
  }
  await command({ action: 'select', index: row.index })
  const pages = useAppStore.getState().browserPagesByWorkspace[workspaceId]
  expect(pages).toHaveLength(1)
  expect(pages[0].id).not.toBe(pageId)
  expect(pages[0].docLocation).toEqual(location)
  expect(pages[0].convertedFrom).toMatchObject({ kind: 'url', url: 'https://before.invalid' })
})
function ToolbarOwner({ active = true }: { active?: boolean }) {
  const [value, setValue] = useState('about:blank')
  const ref = useRef<HTMLInputElement | null>(null)
  return (
    <BrowserPageToolbar
      browserPageId={pageId}
      workspaceId={workspaceId}
      worktreeId="folder-fixture"
      sessionProfileId={null}
      viewportPresetId={null}
      isActive={active}
      canGoBack={false}
      canGoForward={false}
      loading={false}
      webviewRef={{ current: null }}
      reloadMenuOpen={false}
      setReloadMenuOpen={vi.fn()}
      reloadButtonLabel="Reload"
      reloadButtonLabelKind="reload"
      reloadShortcut=""
      hardReloadShortcut=""
      runReloadTrigger={vi.fn()}
      addressBarValue={value}
      setAddressBarValue={setValue}
      submitAddressBar={vi.fn()}
      navigateToUrl={vi.fn()}
      addressBarInputRef={ref}
      dismissAddressBarSuggestionsRef={{ current: null }}
      grab={{
        state: 'idle',
        payload: null,
        error: null,
        contextMenu: false,
        toggle: vi.fn(),
        cancel: vi.fn(),
        rearm: vi.fn(),
        exit: vi.fn()
      }}
      grabIntent="copy"
      startGrabIntent={vi.fn()}
      isBlankTab={false}
      markupIsActive={false}
      markupStart={async () => {}}
      markupCancel={vi.fn()}
      grabElementShortcut=""
      browserAnnotationsLength={0}
      shareableArtifactFile={null}
      currentBrowserUrl="about:blank"
      externalUrl={null}
    />
  )
}
