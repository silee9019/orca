// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { fireEvent, screen } from '@testing-library/react'
import { afterAll, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n/i18n'
import { requestBrowserDocument } from '@/runtime/browser-document-request'
import {
  renderPreview,
  store,
  storeState,
  osOpens,
  ABSOLUTE_PATH,
  installDocPreviewTestApi
} from './doc-preview-owner-test-fixture'
const language = i18n.language
afterAll(async () => {
  await i18n.changeLanguage(language)
})
it('uses the actual document source/default-app descriptors and typed owner with the same fake provider targets', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  await i18n.changeLanguage('en')
  const api = Object.getOwnPropertyDescriptor(window, 'api')
  installDocPreviewTestApi()
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    await renderPreview(container, root)
    storeState.settings.activeRuntimeEnvironmentId = null
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open source file' }))
    })
    expect(store.openedFiles).toEqual([
      expect.objectContaining({ filePath: ABSOLUTE_PATH, worktreeId: 'wt-1', mode: 'edit' })
    ])
    await act(async () => {
      await expect(
        requestBrowserDocument('preview-1', { action: 'open-source' }, Date.now() + 2000)
      ).resolves.toMatchObject({ openedFileId: 'file-1' })
    })
    expect(store.openedFiles).toHaveLength(2)
    expect(store.openedFiles[1]).toEqual(store.openedFiles[0])
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open with default app' }))
    })
    expect(store.downloads).toEqual([ABSOLUTE_PATH])
    await act(async () => {
      await expect(
        requestBrowserDocument('preview-1', { action: 'open-external' }, Date.now() + 2000)
      ).resolves.toMatchObject({ page: 'preview-1', worktreeId: 'wt-1' })
    })
    expect(store.downloads).toEqual([ABSOLUTE_PATH, ABSOLUTE_PATH])
    expect(osOpens).toEqual([])
    store.externalOpenAccepted = false
    await act(async () => {
      await expect(
        requestBrowserDocument('preview-1', { action: 'open-external' }, Date.now() + 2000)
      ).rejects.toThrow('not_verified')
    })
  } finally {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
    if (api) {
      Object.defineProperty(window, 'api', api)
    } else {
      Reflect.deleteProperty(window, 'api')
    }
  }
})
