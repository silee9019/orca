import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserViewerCommand } from '../../../shared/rpc-contract/browser-viewer-params'

const fixture = vi.hoisted(() => {
  const nullable: { environment: string | null; preset: string | null } = {
    environment: null,
    preset: null
  }
  const state = {
    settings: { activeRuntimeEnvironmentId: nullable.environment },
    persistedUIReady: true,
    browserPagesByWorkspace: {
      workspace: [
        {
          id: 'page-1',
          viewportPresetId: nullable.preset,
          browserRuntimeEnvironmentId: nullable.environment
        }
      ]
    },
    remoteBrowserPageHandlesByPageId: {},
    browserAnnotationsByPageId: {
      'page-1': [
        {
          id: 'note-1',
          comment: 'before',
          intent: 'fix',
          priority: 'suggestion',
          createdAt: '2026-10-08T00:00:00+09:00'
        }
      ]
    },
    browserUrlHistory: [{ url: 'https://fixture.invalid', title: 'Fixture', lastVisitedAt: 1 }],
    clearBrowserHistory: vi.fn(),
    setBrowserPageViewportPreset: vi.fn(),
    updateBrowserPageAnnotation: vi.fn(),
    deleteBrowserPageAnnotation: vi.fn(),
    clearBrowserPageAnnotations: vi.fn()
  }
  return {
    state,
    annotationTray: vi
      .fn()
      .mockResolvedValue({ noteCount: 1, open: true, copied: true, sendMenuOpen: false }),
    contextMenu: vi.fn().mockResolvedValue({
      open: false,
      focusedItem: null,
      hasLink: true,
      hasSelection: false,
      clipboardWritten: true,
      guestFocusRequested: true
    }),
    address: vi.fn().mockResolvedValue({
      value: 'review',
      open: true,
      focused: true,
      selectedIndex: 0,
      suggestions: []
    }),
    markupEditor: vi.fn().mockResolvedValue({
      tool: 'rect',
      color: '#3b82f6',
      width: 4,
      fontSize: 18,
      shapeCount: 0,
      pendingText: false,
      canUndo: false,
      canRedo: false
    }),
    markup: vi.fn().mockResolvedValue({ state: 'drawing', hasImage: true }),
    draft: vi.fn().mockReturnValue({ hasDraft: false, annotationId: 'saved-note' }),
    grab: vi.fn().mockResolvedValue({
      state: 'awaiting',
      hasSelection: false,
      hasScreenshot: false,
      contextMenu: false
    }),
    toolbar: vi.fn().mockReturnValue({ action: 'back' }),
    find: vi
      .fn()
      .mockResolvedValue({ open: true, query: 'needle', activeMatch: 2, totalMatches: 3 }),
    webviews: new Map<string, { getZoomLevel: () => number }>()
  }
})
vi.mock('./browser-annotation-tray-request', () => ({
  requestBrowserAnnotationTray: fixture.annotationTray
}))
vi.mock('./browser-context-menu-request', () => ({
  requestBrowserContextMenu: fixture.contextMenu
}))
vi.mock('./browser-address-request', () => ({ requestBrowserAddress: fixture.address }))
vi.mock('./browser-markup-editor-request', () => ({
  requestBrowserMarkupEditor: fixture.markupEditor
}))
vi.mock('./browser-markup-request', () => ({ requestBrowserMarkup: fixture.markup }))
vi.mock('./browser-annotation-draft-request', () => ({
  requestBrowserAnnotationDraft: fixture.draft
}))
vi.mock('./browser-grab-request', () => ({ requestBrowserGrab: fixture.grab }))
vi.mock('./browser-toolbar-request', () => ({ requestBrowserToolbar: fixture.toolbar }))
vi.mock('./browser-find-request', () => ({ requestBrowserFind: fixture.find }))
vi.mock('@/components/browser-pane/host-guest/webview-registry', () => ({
  webviewRegistry: fixture.webviews
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => fixture.state } }))
vi.mock('@/store/slices/browser-page-records', () => ({
  findPage: (rows: typeof fixture.state.browserPagesByWorkspace, id: string) =>
    rows.workspace.find((page) => page.id === id) ?? null
}))
import { applyBrowserViewerRequest } from './browser-viewer-bridge'

function request(command: unknown, expiresAt = Date.now() + 1000) {
  return applyBrowserViewerRequest({
    id: 'fixture',
    expiresAt,
    command: BrowserViewerCommand.parse(command)
  })
}

afterEach(() => vi.unstubAllGlobals())
beforeEach(() => {
  vi.stubGlobal('window', {
    api: {
      browser: {
        cancelDownload: vi.fn().mockResolvedValue(true),
        setViewportOverride: vi.fn().mockResolvedValue(true),
        respondWebAuthnAccount: vi.fn().mockResolvedValue(true),
        openDevTools: vi.fn().mockResolvedValue(true)
      }
    }
  })
  fixture.state.settings.activeRuntimeEnvironmentId = null
  fixture.state.persistedUIReady = true
  fixture.state.browserPagesByWorkspace.workspace[0].browserRuntimeEnvironmentId = null
  fixture.state.browserPagesByWorkspace.workspace[0].viewportPresetId = null
  fixture.state.browserAnnotationsByPageId['page-1'] = [
    {
      id: 'note-1',
      comment: 'before',
      intent: 'fix',
      priority: 'suggestion',
      createdAt: '2026-10-08T00:00:00+09:00'
    }
  ]
  fixture.state.browserUrlHistory = [
    { url: 'https://fixture.invalid', title: 'Fixture', lastVisitedAt: 1 }
  ]
  vi.clearAllMocks()
  fixture.state.clearBrowserHistory.mockImplementation(() => {
    fixture.state.browserUrlHistory = []
  })
  fixture.state.setBrowserPageViewportPreset.mockImplementation(
    (_page: string, preset: string | null) => {
      fixture.state.browserPagesByWorkspace.workspace[0].viewportPresetId = preset
    }
  )
  fixture.state.updateBrowserPageAnnotation.mockImplementation(
    (_page: string, _id: string, patch: { comment: string; intent: string }) => {
      Object.assign(fixture.state.browserAnnotationsByPageId['page-1'][0], patch)
    }
  )
  fixture.state.deleteBrowserPageAnnotation.mockImplementation(() => {
    fixture.state.browserAnnotationsByPageId['page-1'] = []
  })
  fixture.state.clearBrowserPageAnnotations.mockImplementation(() => {
    fixture.state.browserAnnotationsByPageId['page-1'] = []
  })
})

describe('browser viewer request effects', () => {
  it('routes picker actions through the existing UI state owner without exposing selection content', async () => {
    const expiresAt = Date.now() + 9000
    expect(
      await request(
        { viewer: 'host', operation: 'grab', page: 'page-1', action: 'start', intent: 'annotate' },
        expiresAt
      )
    ).toMatchObject({
      applied: true,
      rendered: false,
      grab: { state: 'awaiting', hasSelection: false }
    })
    expect(fixture.grab.mock.calls).toEqual([
      ['page-1', 'intent-start', expiresAt, 'annotate'],
      ['page-1', 'await-ready', expiresAt]
    ])
  })
  it('routes explicit intent toggles once to the original intent owner', async () => {
    const expiresAt = Date.now() + 9000
    await request(
      { viewer: 'host', operation: 'grab', page: 'page-1', action: 'toggle', intent: 'copy' },
      expiresAt
    )
    expect(fixture.grab.mock.calls).toEqual([['page-1', 'toggle', expiresAt, 'copy']])
    expect(
      BrowserViewerCommand.safeParse({
        viewer: 'host',
        operation: 'grab',
        page: 'page-1',
        action: 'toggle'
      }).success
    ).toBe(false)
  })
  it('routes state-aware toolbar navigation to the exact owning page', async () => {
    const expiresAt = Date.now() + 9000
    expect(
      await request(
        { viewer: 'host', operation: 'toolbar-navigation', page: 'page-1', action: 'back' },
        expiresAt
      )
    ).toMatchObject({ applied: true, rendered: false, toolbar: { action: 'back' } })
    expect(fixture.toolbar).toHaveBeenCalledExactlyOnceWith('page-1', 'back', expiresAt)
  })
  it('routes the exact host page and expiry to the existing find UI without claiming rendering', async () => {
    const expiresAt = Date.now() + 9000
    expect(
      await request(
        { viewer: 'host', operation: 'find-query', page: 'page-1', query: 'needle' },
        expiresAt
      )
    ).toMatchObject({
      applied: true,
      rendered: false,
      find: { query: 'needle', activeMatch: 2, totalMatches: 3 }
    })
    expect(fixture.find).toHaveBeenLastCalledWith('page-1', 'query', expiresAt, 'needle')
    await request({ viewer: 'host', operation: 'find', page: 'page-1', action: 'close' }, expiresAt)
    expect(fixture.find).toHaveBeenLastCalledWith('page-1', 'close', expiresAt, undefined)
  })
  it('reads, edits, and deletes only the requested existing annotation', async () => {
    expect(
      await request({ viewer: 'host', operation: 'annotation-list', page: 'page-1' })
    ).toMatchObject({
      annotations: [{ id: 'note-1', comment: 'before' }],
      rendered: false,
      persisted: false
    })
    expect(
      await request({
        viewer: 'host',
        operation: 'annotation-update',
        page: 'page-1',
        annotationId: 'note-1',
        comment: 'after',
        intent: 'question'
      })
    ).toMatchObject({ applied: true, annotations: [{ comment: 'after', intent: 'question' }] })
    expect(
      await request({
        viewer: 'host',
        operation: 'annotation-delete',
        page: 'page-1',
        annotationId: 'note-1'
      })
    ).toMatchObject({ applied: true, annotations: [] })
    await expect(
      request({
        viewer: 'host',
        operation: 'annotation-delete',
        page: 'page-1',
        annotationId: 'missing'
      })
    ).rejects.toThrow('browser_annotation_not_found')
  })
  it('clears annotations, reads and clears history, and observes the requested viewport preset', async () => {
    expect(
      await request({ viewer: 'host', operation: 'annotation-clear', page: 'page-1' })
    ).toMatchObject({ applied: true, annotations: [] })
    expect(await request({ viewer: 'host', operation: 'history-list' })).toMatchObject({
      history: [{ url: 'https://fixture.invalid' }]
    })
    expect(await request({ viewer: 'host', operation: 'history-clear' })).toMatchObject({
      applied: true,
      history: []
    })
    expect(
      await request({
        viewer: 'host',
        operation: 'viewport-preset',
        page: 'page-1',
        preset: 'tablet'
      })
    ).toMatchObject({ applied: true, preset: 'tablet' })
  })
  it('rejects expired, unready, remote-runtime and foreign-page requests before mutation', async () => {
    const command = { viewer: 'host', operation: 'annotation-clear', page: 'page-1' }
    await expect(request(command, 0)).rejects.toThrow('request_expired')
    fixture.state.persistedUIReady = false
    await expect(request(command)).rejects.toThrow('viewer_not_ready')
    fixture.state.persistedUIReady = true
    fixture.state.settings.activeRuntimeEnvironmentId = 'remote'
    await expect(request(command)).rejects.toThrow('viewer_runtime_mismatch')
    fixture.state.settings.activeRuntimeEnvironmentId = null
    fixture.state.browserPagesByWorkspace.workspace[0].browserRuntimeEnvironmentId = 'remote'
    await expect(request(command)).rejects.toThrow('browser_page_host_mismatch')
    expect(fixture.state.clearBrowserPageAnnotations).not.toHaveBeenCalled()
  })
})

it('routes download cancellation and WebAuthn replies through sender-authorized preload APIs', async () => {
  expect(
    await request({ viewer: 'host', operation: 'download-cancel', downloadId: 'download-1' })
  ).toMatchObject({ applied: true })
  expect(window.api.browser.cancelDownload).toHaveBeenCalledExactlyOnceWith({
    downloadId: 'download-1'
  })
  expect(
    await request({
      viewer: 'host',
      operation: 'webauthn-respond',
      requestId: 'request-1',
      credentialId: null
    })
  ).toMatchObject({ applied: true })
  expect(window.api.browser.respondWebAuthnAccount).toHaveBeenCalledExactlyOnceWith({
    requestId: 'request-1',
    credentialId: null
  })
  expect(
    await request({ viewer: 'host', operation: 'devtools-open', page: 'page-1' })
  ).toMatchObject({ applied: true, rendered: false })
  expect(window.api.browser.openDevTools).toHaveBeenCalledExactlyOnceWith({
    browserPageId: 'page-1'
  })
})

it('uses the existing page zoom event and verifies the guest level changed', async () => {
  let zoomLevel = 0
  fixture.webviews.set('page-1', { getZoomLevel: () => zoomLevel })
  window.dispatchEvent = vi.fn(() => {
    zoomLevel = 0.5
    return true
  })
  expect(
    await request({ viewer: 'host', operation: 'zoom', page: 'page-1', direction: 'in' })
  ).toMatchObject({ applied: true, zoomLevel: 0.5, rendered: false })
  expect(window.dispatchEvent).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      type: 'orca:browser-page-zoom',
      detail: { browserPageId: 'page-1', direction: 'in' }
    })
  )
  fixture.webviews.clear()
})

it('routes annotation drafts to the exact active page owner without returning capture contents', async () => {
  const expiresAt = Date.now() + 1000
  expect(
    await request(
      {
        viewer: 'host',
        operation: 'annotation-add',
        page: 'page-1',
        comment: 'review',
        intent: 'question'
      },
      expiresAt
    )
  ).toMatchObject({
    applied: true,
    persisted: false,
    rendered: false,
    draft: { hasDraft: false, annotationId: 'saved-note' }
  })
  expect(fixture.draft).toHaveBeenCalledWith(
    'page-1',
    { action: 'add', comment: 'review', intent: 'question' },
    expiresAt
  )
  fixture.draft.mockImplementationOnce(() => {
    throw new Error('browser_annotation_draft_missing')
  })
  await expect(
    request({ viewer: 'host', operation: 'annotation-draft', page: 'page-1', action: 'cancel' })
  ).rejects.toThrow('browser_annotation_draft_missing')
})

it('routes markup lifecycle to the exact page owner without claiming rendering', async () => {
  expect(
    await request({ viewer: 'host', operation: 'markup', page: 'page-1', action: 'start' })
  ).toMatchObject({ applied: true, rendered: false, markup: { state: 'drawing', hasImage: true } })
  expect(fixture.markup).toHaveBeenCalledWith('page-1', 'start', expect.any(Number))
})

it('routes editor commands to the exact markup owner without exposing raster or text contents', async () => {
  expect(
    await request({
      viewer: 'host',
      operation: 'markup-editor',
      page: 'page-1',
      command: { action: 'tool', value: 'rect' }
    })
  ).toMatchObject({ applied: true, rendered: false, markupEditor: { tool: 'rect', shapeCount: 0 } })
  expect(fixture.markupEditor).toHaveBeenCalledWith(
    'page-1',
    { action: 'tool', value: 'rect' },
    expect.any(Number)
  )
})

it('routes address editing to the selected host page owner', async () => {
  expect(
    await request({
      viewer: 'host',
      operation: 'address',
      page: 'page-1',
      command: { action: 'draft', text: 'review' }
    })
  ).toMatchObject({ applied: true, rendered: false, address: { value: 'review', open: true } })
  expect(fixture.address).toHaveBeenCalledWith(
    'page-1',
    { action: 'draft', text: 'review' },
    expect.any(Number)
  )
})

it('routes annotation tray copy to the native owner and returns only its acknowledged state', async () => {
  expect(
    await request({ viewer: 'host', operation: 'annotation-tray', page: 'page-1', action: 'copy' })
  ).toMatchObject({
    applied: true,
    rendered: false,
    annotationTray: { copied: true, noteCount: 1 }
  })
  expect(fixture.annotationTray).toHaveBeenCalledWith('page-1', 'copy', expect.any(Number))
})

it('routes context menu copy to its selected native page owner', async () => {
  expect(
    await request({
      viewer: 'host',
      operation: 'context-menu',
      page: 'page-1',
      action: 'copy-link'
    })
  ).toMatchObject({
    applied: true,
    rendered: false,
    contextMenu: { open: false, clipboardWritten: true }
  })
  expect(fixture.contextMenu).toHaveBeenCalledWith('page-1', 'copy-link', expect.any(Number))
})
