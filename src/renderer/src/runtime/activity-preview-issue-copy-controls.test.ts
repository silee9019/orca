// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest'
import {
  publishActivityPreviewIssueCopyControl,
  readActivityPreviewIssueCopyControl
} from './activity-preview-issue-copy-controls'
it('binds the original callback and URL to only its exact portal', () => {
  const portal = document.createElement('div')
  const copy = vi.fn(async () => true)
  const cleanup = publishActivityPreviewIssueCopyControl(portal, {
    url: 'https://example.com/issue',
    copy
  })
  const lease = readActivityPreviewIssueCopyControl(portal)
  expect(lease?.url).toBe('https://example.com/issue')
  expect(lease?.copy).toBe(copy)
  expect(lease?.isCurrent()).toBe(true)
  expect(readActivityPreviewIssueCopyControl(document.createElement('div'))).toBeNull()
  cleanup()
  expect(lease?.isCurrent()).toBe(false)
  expect(readActivityPreviewIssueCopyControl(portal)).toBeNull()
})
it('never revives a captured lease after URL and callback change-return', () => {
  const portal = document.createElement('div')
  const original = { url: 'https://example.com/original', copy: vi.fn(async () => true) }
  const first = publishActivityPreviewIssueCopyControl(portal, original)
  const captured = readActivityPreviewIssueCopyControl(portal)
  first()
  const next = publishActivityPreviewIssueCopyControl(portal, {
    url: 'https://example.com/other',
    copy: vi.fn(async () => true)
  })
  next()
  const restored = publishActivityPreviewIssueCopyControl(portal, original)
  expect(captured?.isCurrent()).toBe(false)
  expect(readActivityPreviewIssueCopyControl(portal)?.isCurrent()).toBe(true)
  first()
  expect(readActivityPreviewIssueCopyControl(portal)?.isCurrent()).toBe(true)
  restored()
})
it('invalidates a captured lease when a duplicate appears and disappears', () => {
  const portal = document.createElement('div')
  const control = { url: 'https://example.com/issue', copy: vi.fn(async () => true) }
  const first = publishActivityPreviewIssueCopyControl(portal, control)
  const captured = readActivityPreviewIssueCopyControl(portal)
  const second = publishActivityPreviewIssueCopyControl(portal, control)
  expect(readActivityPreviewIssueCopyControl(portal)).toBeNull()
  second()
  expect(captured?.isCurrent()).toBe(false)
  expect(readActivityPreviewIssueCopyControl(portal)).toBeNull()
  first()
})
