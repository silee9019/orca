import { describe, expect, it } from 'vitest'
import { isBrowserPlacementViewerCommand } from './browser-placement-viewer-command'

describe('browser placement viewer routing boundary', () => {
  it('keeps client submission and existing client navigation before the runtime guard', () => {
    expect(isBrowserPlacementViewerCommand({ operation: 'client-submission' })).toBe(true)
    expect(isBrowserPlacementViewerCommand({ operation: 'client-document' })).toBe(true)
    expect(isBrowserPlacementViewerCommand({ operation: 'client-staged-document' })).toBe(true)
    expect(isBrowserPlacementViewerCommand({ operation: 'client-deferred' })).toBe(true)
    expect(isBrowserPlacementViewerCommand({ operation: 'client-navigation' })).toBe(true)
  })

  it('keeps local markup and feature actions behind their existing runtime guard', () => {
    for (const operation of [
      'viewport-pan',
      'markup-hint',
      'markup-editor',
      'markup',
      'browser-setup-guide',
      'browser-feature-wall',
      'zoom',
      'future-operation'
    ]) {
      expect(isBrowserPlacementViewerCommand({ operation })).toBe(false)
    }
  })
})
