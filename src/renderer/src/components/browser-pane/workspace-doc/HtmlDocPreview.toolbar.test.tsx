// @vitest-environment happy-dom
import {
  GRANT_ID,
  MARKUP_DRAW_HINT_SEEN_KEY,
  ENTRY_RELATIVE_PATH,
  ABSOLUTE_PATH,
  clipboard,
  grabCalls,
  osOpens,
  store,
  installDocPreviewTestApi,
  provider,
  storeState,
  renderPreview,
  stubHistory,
  button
} from './doc-preview-owner-test-fixture'
//
// The preview is an editor tab that has to read like a browser tab. These pin the parts of that
// illusion a reader can catch us on: the document names itself and its owning machine instead of
// showing the internal preview scheme, Back/Forward really drive the guest's history, and the chip
// hands over the path the owner spells rather than the one the grant was minted with.
import { act } from 'react'
import { requestBrowserDocument } from '@/runtime/browser-document-request'
import { requestBrowserAddress } from '@/runtime/browser-address-request'
import type { BrowserPage, BrowserWorkspace } from '../../../../../shared/browser-workspace-types'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { acquireWebviewsDragPassthrough } from '@/components/browser-pane/host-guest/webview-drag-passthrough'

describe('HtmlDocPreview browser chrome', () => {
  let container: HTMLDivElement
  let root: Root
  let mounted = false

  beforeEach(() => {
    mounted = true
    storeState.settings.activeRuntimeEnvironmentId = 'env-1'
    installDocPreviewTestApi()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    if (mounted) {
      act(() => root.unmount())
      mounted = false
    }
    container.remove()
  })

  it('counts document guests in the workspace budget and restores only on activation', async () => {
    const { hasLiveBrowserGuest, webviewRegistry } = await import('../host-guest/webview-registry')
    const { worktreeHoldsLiveBrowserGuests, selectBrowserGuestEvictionWorktreeIds } =
      await import('../host-guest/browser-guest-worktree-retention')
    const { destroyWorktreeBrowserGuests } = await import('@/store/slices/browser-webview-cleanup')
    const guest = await renderPreview(container, root)
    expect(hasLiveBrowserGuest('preview-1')).toBe(true)
    expect(await renderPreview(container, root, { isActive: false })).toBe(guest)
    const page: BrowserPage = {
      id: 'preview-1',
      workspaceId: 'browser-1',
      worktreeId: 'wt-1',
      url: 'about:blank',
      title: 'Report',
      loading: false,
      faviconUrl: null,
      canGoBack: false,
      canGoForward: false,
      loadError: null,
      createdAt: 1,
      docLocation: { kind: 'workspace-doc', worktreeId: 'wt-1', filePath: ABSOLUTE_PATH }
    }
    const browsers: BrowserWorkspace[] = [{ ...page, id: 'browser-1', pageIds: [page.id] }]
    const pages: Record<string, BrowserPage[]> = { 'browser-1': [page] }
    const evicted = selectBrowserGuestEvictionWorktreeIds({
      orderedWorktreeIds: ['wt-1'],
      activeWorktreeId: 'wt-2',
      limit: 0,
      isRetained: () => true,
      isEvictable: () => true,
      holdsLiveGuests: () => worktreeHoldsLiveBrowserGuests(browsers, pages, hasLiveBrowserGuest)
    })
    expect(evicted).toEqual(['wt-1'])
    await act(async () => {
      destroyWorktreeBrowserGuests({ 'wt-1': browsers }, pages, 'wt-1')
    })
    expect(guest.isConnected).toBe(false)
    expect(hasLiveBrowserGuest('preview-1')).toBe(false)
    expect(container.querySelector('webview')).toBeNull()
    const restored = await renderPreview(container, root)
    expect(restored).not.toBe(guest)
    expect(webviewRegistry.get('preview-1')).toBe(restored)
    expect(await renderPreview(container, root, { isActive: false })).toBe(restored)
    expect(await renderPreview(container, root)).toBe(restored)
    await act(async () => root.unmount())
    mounted = false
    expect(hasLiveBrowserGuest('preview-1')).toBe(false)
  })

  it('uses the document owner for reload, clipboard read-back and source opening', async () => {
    const guest = await renderPreview(container, root)
    stubHistory(guest, { canGoBack: false, canGoForward: false })
    const reload = vi.spyOn(guest, 'reload')
    const invoke = (action: 'reload' | 'copy-path' | 'copy-relative-path' | 'open-source') =>
      requestBrowserDocument('preview-1', { action }, Date.now() + 1000)
    await expect(invoke('reload')).resolves.toMatchObject({ navigationRequested: true })
    expect(reload).toHaveBeenCalledOnce()
    await invoke('copy-path')
    await invoke('copy-relative-path')
    expect(clipboard.writes).toEqual([ABSOLUTE_PATH, ENTRY_RELATIVE_PATH])
    await expect(invoke('open-source')).resolves.toMatchObject({ openedFileId: 'file-1' })
    expect(store.openedFiles).toEqual([
      expect.objectContaining({ filePath: ABSOLUTE_PATH, worktreeId: 'wt-1', mode: 'edit' })
    ])
    await renderPreview(container, root, { isActive: false })
    await expect(invoke('reload')).rejects.toThrow('inactive')
    expect(reload).toHaveBeenCalledOnce()
    await expect(
      requestBrowserDocument('missing', { action: 'status' }, Date.now() + 1000)
    ).rejects.toThrow('owner_unavailable')
  })

  it('grants only the exact pending directories and preserves newly offered requests', async () => {
    const guest = await renderPreview(container, root)
    stubHistory(guest, { canGoBack: false, canGoForward: false })
    await act(async () => {
      provider.onFailure?.({
        grantId: GRANT_ID,
        relativePath: 'assets/a.css',
        reason: 'authorization-required'
      })
    })
    await expect(
      requestBrowserDocument(
        'preview-1',
        { action: 'directory-allow', paths: ['other/file'], confirmation: 'preview-1' },
        Date.now() + 1000
      )
    ).rejects.toThrow('confirmation_mismatch')
    expect(provider.authorize).not.toHaveBeenCalled()
    let complete: ((accepted: boolean) => void) | undefined
    provider.authorize.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        })
    )
    const response = requestBrowserDocument(
      'preview-1',
      { action: 'directory-allow', paths: ['assets/a.css'], confirmation: 'preview-1' },
      Date.now() + 1000
    )
    await act(async () => {
      provider.onFailure?.({
        grantId: GRANT_ID,
        relativePath: 'data/b.json',
        reason: 'authorization-required'
      })
    })
    await act(async () => {
      complete?.(true)
      await response
    })
    expect(provider.authorize).toHaveBeenCalledWith(GRANT_ID, 'assets/a.css')
    await expect(
      requestBrowserDocument('preview-1', { action: 'status' }, Date.now() + 1000)
    ).resolves.toMatchObject({ pendingPaths: ['data/b.json'] })
    await act(async () => {
      await requestBrowserDocument('preview-1', { action: 'directory-dismiss' }, Date.now() + 1000)
    })
    expect(container.textContent).not.toContain('Allow folder')
  })

  it('refuses late directory authorization receipts after the owner unmounts', async () => {
    const guest = await renderPreview(container, root)
    stubHistory(guest, { canGoBack: false, canGoForward: false })
    const reload = vi.spyOn(guest, 'reload')
    await act(async () => {
      provider.onFailure?.({
        grantId: GRANT_ID,
        relativePath: 'assets/a.css',
        reason: 'authorization-required'
      })
    })
    let complete: ((accepted: boolean) => void) | undefined
    provider.authorize.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        })
    )
    const response = requestBrowserDocument(
      'preview-1',
      { action: 'directory-allow', paths: ['assets/a.css'], confirmation: 'preview-1' },
      Date.now() + 1000
    )
    const rejected = expect(response).rejects.toThrow('owner_changed_effect_unknown')
    await act(async () => {
      root.unmount()
      mounted = false
    })
    await rejected
    await act(async () => {
      complete?.(true)
    })
    expect(reload).not.toHaveBeenCalled()
  })

  it('opens the real document address editor, edits its input and cancels back to the chip', async () => {
    await renderPreview(container, root)
    const opening = requestBrowserAddress('preview-1', { action: 'open' }, Date.now() + 1000)
    await act(async () => {})
    await expect(opening).resolves.toMatchObject({ value: ENTRY_RELATIVE_PATH, focused: true })
    const input = container.querySelector('input')
    expect(input?.value).toBe(ENTRY_RELATIVE_PATH)
    expect(document.activeElement).toBe(input)
    const draft = requestBrowserAddress(
      'preview-1',
      { action: 'draft', text: 'https://example.com' },
      Date.now() + 1000
    )
    await act(async () => {})
    await expect(draft).resolves.toMatchObject({ value: 'https://example.com' })
    expect(input?.value).toBe('https://example.com')
    const cancel = requestBrowserAddress('preview-1', { action: 'dismiss' }, Date.now() + 1000)
    await act(async () => {})
    await expect(cancel).resolves.toMatchObject({ open: false, focused: false })
    expect(container.querySelector('input')).toBeNull()
    expect(store.conversions).toEqual([])
  })

  it('requires the document external-open owner receipt and refuses a canceled open', async () => {
    await renderPreview(container, root)
    store.externalOpenAccepted = false
    await expect(
      requestBrowserDocument('preview-1', { action: 'open-external' }, Date.now() + 1000)
    ).rejects.toThrow('external_open_not_verified')
    store.externalOpenAccepted = true
    await expect(
      requestBrowserDocument('preview-1', { action: 'open-external' }, Date.now() + 1000)
    ).resolves.toMatchObject({ page: 'preview-1' })
    expect(store.downloads).toEqual([ABSOLUTE_PATH, ABSOLUTE_PATH])
    expect(osOpens).toEqual([])
  })

  it('hard-reloads by revoking and reminting the same document grant', async () => {
    const before = await renderPreview(container, root)
    const grants = await import('@/lib/doc-preview-grants')
    const revoke = vi.spyOn(grants, 'releaseDocPreviewGrant')
    const mint = vi.spyOn(grants, 'ensureDocPreviewGrant')
    await act(async () => {
      await expect(
        requestBrowserDocument('preview-1', { action: 'hard-reload' }, Date.now() + 1000)
      ).resolves.toMatchObject({ navigationRequested: true })
    })
    expect(revoke).toHaveBeenCalledWith('preview-1')
    expect(mint).toHaveBeenCalledOnce()
    expect(container.querySelector('webview')).not.toBe(before)
    revoke.mockRestore()
    mint.mockRestore()
  })

  it('submits the document address through its original conversion callback', async () => {
    await renderPreview(container, root)
    for (const command of [
      { action: 'open' },
      { action: 'draft', text: 'https://example.com' },
      { action: 'submit' }
    ] as const) {
      const response = requestBrowserAddress('preview-1', command, Date.now() + 1000)
      await act(async () => {})
      await response
    }
    expect(store.conversions).toEqual([
      { pageId: 'preview-1', target: { kind: 'web', url: 'https://example.com/' } }
    ])
  })

  it('converts a typed workspace document through its existing path resolver and owner', async () => {
    await renderPreview(container, root)
    for (const command of [
      { action: 'open' },
      { action: 'draft', text: './docs/next.html' }
    ] as const) {
      const response = requestBrowserAddress('preview-1', command, Date.now() + 1000)
      void response.catch(() => {})
      await act(async () => {})
      await response
    }
    await act(async () => {
      await expect(
        requestBrowserDocument('preview-1', { action: 'address-submit' }, Date.now() + 1000)
      ).resolves.toMatchObject({ navigationRequested: true })
    })
    expect(store.conversions).toEqual([
      {
        pageId: 'preview-1',
        target: {
          kind: 'workspace-doc',
          docLocation: {
            kind: 'workspace-doc',
            worktreeId: 'wt-1',
            filePath: '/repo/docs/next.html'
          }
        }
      }
    ])
    expect(container.querySelector('input')).toBeNull()
  })

  it('reads document state from the mounted preview owner', async () => {
    await renderPreview(container, root)
    await expect(
      requestBrowserDocument('preview-1', { action: 'status' }, Date.now() + 1000)
    ).resolves.toMatchObject({
      page: 'preview-1',
      worktreeId: 'wt-1',
      phase: 'ready',
      pendingPaths: []
    })
  })

  it('identifies the document by its workspace path and owning machine', async () => {
    await renderPreview(container, root)

    const text = container.textContent ?? ''
    expect(text).toContain('docs/reports/')
    expect(text).toContain('index.html')
    expect(text).toContain('Workspace file')
    expect(text).toContain('Studio Mac mini')
  })

  // The internal scheme is an implementation detail of how the workspace hands bytes to the guest.
  // The guest's own src attribute necessarily carries it; no other node in the tree may.
  it('never shows the internal preview scheme to the reader', async () => {
    const webview = await renderPreview(container, root)

    expect(webview.getAttribute('src')).toContain('orca-preview')
    const withoutGuest = container.cloneNode(true) as HTMLElement
    for (const guest of withoutGuest.querySelectorAll('webview')) {
      guest.remove()
    }
    expect(withoutGuest.innerHTML).not.toContain('orca-preview')
  })

  // Why this is a drag bug and not a styling one: a <webview> takes the pointer stream the
  // document never sees, so a tab drag stops getting pointermove the moment the cursor crosses
  // the preview — the dragged tab stops following the cursor and the split cannot be dropped.
  it('holds the guest click-through while a renderer drag is in flight', async () => {
    const webview = await renderPreview(container, root)

    const guest = webview as unknown as HTMLElement
    let release: (() => void) | null = null
    expect(guest.style.pointerEvents).toBe('')

    await act(async () => {
      release = acquireWebviewsDragPassthrough()
    })
    expect(guest.style.pointerEvents).toBe('none')

    await act(async () => release?.())
    expect(guest.style.pointerEvents).toBe('')
  })

  // Why append time and not the enrolling effect: dragging the preview's OWN tab across a split
  // remounts this component mid-drag, and an effect settles a turn later — for the rest of that
  // turn the fresh guest is hittable and eats the pointer stream, which is the original freeze.
  it('holds a guest that appears mid-drag click-through the moment it is appended', async () => {
    const appendedPointerEvents: string[] = []
    const originalAppendChild = HTMLElement.prototype.appendChild
    HTMLElement.prototype.appendChild = function <T extends Node>(node: T): T {
      const element = node as unknown as HTMLElement
      if (element.tagName?.toLowerCase() === 'webview') {
        appendedPointerEvents.push(element.style.pointerEvents)
      }
      return originalAppendChild.call(this, node) as T
    }
    const release = acquireWebviewsDragPassthrough()

    try {
      await renderPreview(container, root)
      expect(appendedPointerEvents).toEqual(['none'])
    } finally {
      HTMLElement.prototype.appendChild = originalAppendChild
      release()
    }
  })

  // Why: the chip sits in the row's height-pinned slot, and a wrapper of its own between the two
  // would leave it its natural height again — the toolbar would shrink for document tabs.
  it('hands the identity chip straight to the height-pinned address slot', async () => {
    await renderPreview(container, root)

    const chip = button(container, 'Edit address')
    const slot = container.querySelector('[data-browser-chrome-address-slot]')
    expect(slot).not.toBeNull()
    expect(chip.parentElement).toBe(slot)
    expect(chip.className).not.toMatch(/(^|\s)h-/)
  })

  // Browser parity: a browser tab is named by the document it shows. What the document names is
  // the tab; what it must never rename is the chip, which is the reader's only proof of which
  // file on which host they are looking at.
  it('lets the document name its tab while the chip keeps naming the file', async () => {
    const webview = await renderPreview(container, root)
    store.pageStateUpdates.length = 0

    await act(async () => {
      const event = new Event('page-title-updated')
      Object.assign(event, { title: 'Quarterly Report' })
      webview.dispatchEvent(event)
    })

    expect(store.pageStateUpdates).toEqual([
      { pageId: 'preview-1', updates: { title: 'Quarterly Report' } }
    ])
    expect(button(container, 'Edit address').textContent).toContain(ENTRY_RELATIVE_PATH)
  })

  // The convergence contract (STA-5681): clicking the chip swaps in the real address bar,
  // prefilled with the file the reader can retype, and a committed web URL converts the page —
  // it never navigates a doc guest, whose policy would deny the URL anyway.
  it('edits the address in place and converts a committed URL instead of navigating', async () => {
    await renderPreview(container, root)
    store.conversions.length = 0

    await act(async () => {
      button(container, 'Edit address').click()
    })
    const input = container.querySelector<HTMLInputElement>(
      '[data-browser-chrome-address-slot] input'
    )
    expect(input).not.toBeNull()
    expect(input?.value).toBe(ENTRY_RELATIVE_PATH)

    await act(async () => {
      input!.value = 'https://example.com/'
      input!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    expect(store.conversions).toEqual([
      { pageId: 'preview-1', target: { kind: 'web', url: 'https://example.com/' } }
    ])
  })

  // Escape hands the slot back to the chip with nothing converted — the reader looked, then left.
  // The first press belongs to the address bar (it closes the suggestion dropdown, as in the URL
  // pane); the second one reaches the wrapper and exits the edit.
  it('returns to the chip on Escape without converting', async () => {
    await renderPreview(container, root)
    store.conversions.length = 0

    await act(async () => {
      button(container, 'Edit address').click()
    })
    const input = container.querySelector<HTMLInputElement>(
      '[data-browser-chrome-address-slot] input'
    )
    await act(async () => {
      input!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    await act(async () => {
      input!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(store.conversions).toEqual([])
    expect(button(container, 'Edit address')).not.toBeNull()
  })

  // Why: the browsing tour walks anchors by name, and a preview answering to the browser pane's
  // anchors would hand it steps about profiles and cookies that a document tab does not have.
  it('claims none of the browsing tour anchors', async () => {
    await renderPreview(container, root)

    expect(container.querySelector('[data-contextual-tour-target]')).toBeNull()
  })

  // Why the menu and no longer the chip: clicking the chip now edits the address, so the menu is
  // the one copy affordance left for the absolute path the owning machine spells.
  it('copies the absolute path the owning machine spells, not the workspace-relative one', async () => {
    await renderPreview(container, root)

    await act(async () => {
      // Why not click(): the Radix trigger opens on pointerdown, which happy-dom does not synthesize.
      button(container, 'Preview options').dispatchEvent(
        new window.PointerEvent('pointerdown', { bubbles: true, button: 0 })
      )
    })
    const absoluteCopy = [...document.querySelectorAll('[role="menuitem"]')].find(
      (item) =>
        item.textContent?.includes('Copy file path') &&
        !item.textContent.includes('Copy relative path')
    )
    expect(absoluteCopy).toBeDefined()

    await act(async () => {
      ;(absoluteCopy as HTMLElement).click()
    })

    expect(clipboard.writes).toEqual([ABSOLUTE_PATH])
  })

  it('starts with both history controls disabled', async () => {
    await renderPreview(container, root)

    expect(button(container, 'Back').disabled).toBe(true)
    expect(button(container, 'Forward').disabled).toBe(true)
  })

  it('enables Back once the guest has somewhere to go back to and drives the guest', async () => {
    const webview = await renderPreview(container, root)
    const { goBack, goForward } = stubHistory(webview, { canGoBack: true, canGoForward: false })

    await act(async () => {
      webview.dispatchEvent(new Event('did-navigate'))
    })

    expect(button(container, 'Back').disabled).toBe(false)
    expect(button(container, 'Forward').disabled).toBe(true)

    await act(async () => {
      button(container, 'Back').click()
      button(container, 'Forward').click()
    })

    expect(goBack).toHaveBeenCalledTimes(1)
    // Why: a disabled edge control must be inert, not merely dimmed.
    expect(goForward).not.toHaveBeenCalled()
  })

  // Fragment links navigate in-document, which is still a history entry a reader expects Back to
  // unwind — the guest reports it on a different event than a full navigation.
  it('tracks in-document navigation as history too', async () => {
    const webview = await renderPreview(container, root)
    stubHistory(webview, { canGoBack: true, canGoForward: true })

    await act(async () => {
      webview.dispatchEvent(new Event('did-navigate-in-page'))
    })

    expect(button(container, 'Back').disabled).toBe(false)
    expect(button(container, 'Forward').disabled).toBe(false)
  })

  it('still reloads the guest in place from the toolbar', async () => {
    const webview = await renderPreview(container, root)
    stubHistory(webview, { canGoBack: false, canGoForward: false })

    await act(async () => {
      button(container, 'Reload preview').click()
    })

    expect(webview.reload).toHaveBeenCalledTimes(1)
  })

  describe('tools', () => {
    it('offers the same tool cluster the browsing pane does', async () => {
      await renderPreview(container, root)

      for (const label of [
        'Grab page element',
        'Annotate page element',
        'Draw on screenshot',
        'Open source file',
        'Open with default app',
        'Preview options'
      ]) {
        expect(button(container, label)).not.toBeNull()
      }
    })

    // Why: cookies land in a browsing session, and a preview reads workspace disk over a grant —
    // there is no session for an import to reach.
    it('hides cookie import, which a preview has no session for', async () => {
      await renderPreview(container, root)

      expect(container.querySelector('button[aria-label="Import cookies from browser"]')).toBeNull()
    })

    // The picker is driven through main, which resolves the page to whichever guest is rendering
    // this document now — so the id it sends is the page, not the grant a re-mint would replace.
    it('arms the element picker against the page the document is open in', async () => {
      await renderPreview(container, root)

      await act(async () => {
        button(container, 'Grab page element').click()
      })

      expect(grabCalls).toEqual([{ browserPageId: 'preview-1', enabled: true }])
    })

    it('opens the document source as its own editor tab', async () => {
      await renderPreview(container, root)

      await act(async () => {
        button(container, 'Open source file').click()
      })

      expect(store.openedFiles).toEqual([
        expect.objectContaining({
          filePath: ABSOLUTE_PATH,
          relativePath: ENTRY_RELATIVE_PATH,
          worktreeId: 'wt-1',
          mode: 'edit'
        })
      ])
    })

    // Why: a preview is a remote document by construction — the client OS has no copy to launch,
    // so "open externally" has to download first.
    it('downloads a runtime-owned document before handing it to the OS', async () => {
      await renderPreview(container, root)

      await act(async () => {
        button(container, 'Open with default app').click()
      })

      expect(store.downloads).toEqual([ABSOLUTE_PATH])
      expect(osOpens).toEqual([])
    })

    // Why the storage flag and not the popover: the nudge fires once per install, and the harm is
    // consuming that one view — a reader who opened a document would spend the browsing pane's
    // introduction to a tool they were not shown.
    it('never spends the once-per-install draw-tool hint', async () => {
      window.localStorage.removeItem(MARKUP_DRAW_HINT_SEEN_KEY)

      await renderPreview(container, root)

      expect(window.localStorage.getItem(MARKUP_DRAW_HINT_SEEN_KEY)).toBeNull()
    })
  })

  // Why it has to be somewhere: the preview hides the editor's path header, and the relative path
  // was only ever copyable from there — the chip and the menu both give the absolute one.
  it('still offers the workspace-relative path the hidden editor header used to copy', async () => {
    await renderPreview(container, root)

    await act(async () => {
      // Why not click(): the Radix trigger opens on pointerdown, which happy-dom does not synthesize.
      button(container, 'Preview options').dispatchEvent(
        new window.PointerEvent('pointerdown', { bubbles: true, button: 0 })
      )
    })
    const relativeCopy = [...document.querySelectorAll('[role="menuitem"]')].find((item) =>
      item.textContent?.includes('Copy relative path')
    )
    expect(relativeCopy).toBeDefined()

    await act(async () => {
      ;(relativeCopy as HTMLElement).click()
    })

    expect(clipboard.writes).toEqual([ENTRY_RELATIVE_PATH])
  })
})

// Why this is a test and not left to the pane: a preview has no address bar to hand focus to the
// document, so without this its keyboard and link input can silently land outside the visible guest.
describe('HtmlDocPreview guest focus', () => {
  let container: HTMLDivElement
  let root: Root
  let focused: Element[]
  let focusSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    focused = []
    focusSpy = vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (
      this: HTMLElement
    ) {
      focused.push(this)
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    focusSpy.mockRestore()
  })

  async function settleFrames(): Promise<void> {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
  }

  it('hands the guest focus once the preview is the surface the reader is in', async () => {
    const webview = await renderPreview(container, root, { holdsGuestFocus: true })
    await settleFrames()

    expect(focused).toContain(webview)
  })

  it('leaves focus alone while the reader is looking at something else', async () => {
    const webview = await renderPreview(container, root, { holdsGuestFocus: false })
    await settleFrames()

    expect(focused).not.toContain(webview)

    // And the window coming back does not reopen the offer a preview behind a terminal refused.
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    await settleFrames()

    expect(focused).not.toContain(webview)
  })

  // Why the window's own focus has to re-offer: another app taking the front pulls focus out of the
  // guest, and coming back lands it on the embedder. The guest is where a clicked link is reported
  // from, so without this the route out of the preview stays shut until something remounts it.
  it('offers the guest focus again after the window gets it back', async () => {
    const webview = await renderPreview(container, root, { holdsGuestFocus: true })
    await settleFrames()
    focused.length = 0

    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    await settleFrames()

    expect(focused).toContain(webview)
  })

  // Why that re-offer has to yield: the window also gets focus back when the reader presses a tab,
  // because the guest holding the keyboard is what blurred the embedder. Taking it back from there
  // fights the reader for their own click.
  it('leaves focus with whatever claimed it when the window comes back', async () => {
    const webview = await renderPreview(container, root, { holdsGuestFocus: true })
    await settleFrames()
    focused.length = 0

    const claimant = document.createElement('button')
    document.body.append(claimant)
    Object.defineProperty(document, 'activeElement', {
      configurable: true,
      get: () => claimant
    })

    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    await settleFrames()

    expect(focused).not.toContain(webview)
    Reflect.deleteProperty(document, 'activeElement')
    claimant.remove()
  })
})
