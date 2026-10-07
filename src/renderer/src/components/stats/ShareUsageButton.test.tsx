// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShareUsageButton } from './ShareUsageButton'
import { applyUsageShareAction } from '../../runtime/usage-share-actions'

const effects = vi.hoisted(() => ({
  capture: vi.fn(async () => 'data:image/png;base64,fixture'),
  clipboard: vi.fn(async () => {}),
  openUrl: vi.fn(async () => {})
}))
vi.mock('html-to-image', () => ({ toPng: effects.capture }))
vi.mock('./ShareUsageCard', async () => {
  const { forwardRef } = await import('react')
  return {
    ShareUsageCard: forwardRef<HTMLDivElement>((_props, ref) => (
      <div ref={ref}>fixture share card</div>
    ))
  }
})
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('usage share existing component lifecycle', () => {
  it('opens the existing dialog, copies its card and opens the fixture composer; unmount removes callbacks', async () => {
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { ui: { writeClipboardImage: effects.clipboard }, shell: { openUrl: effects.openUrl } }
    })
    const view = render(
      <ShareUsageButton
        provider="codex"
        range="7d"
        daily={[]}
        summary={{
          scope: 'orca',
          range: '7d',
          sessions: 1,
          events: 1,
          inputTokens: 10,
          cachedInputTokens: 0,
          outputTokens: 2,
          reasoningOutputTokens: 0,
          totalTokens: 12,
          estimatedCostUsd: 0.02,
          hasUnpricedModels: false,
          topModel: 'fixture',
          topProject: null,
          hasAnyCodexData: true
        }}
      />
    )
    await expect(applyUsageShareAction('codex', 'copy')).rejects.toThrow(
      'usage_share_card_unavailable'
    )
    await act(async () => {
      await applyUsageShareAction('codex', 'open')
    })
    expect(screen.getByText('fixture share card')).toBeTruthy()
    await act(async () => {
      await applyUsageShareAction('codex', 'copy')
    })
    expect(effects.capture).toHaveBeenCalledOnce()
    expect(effects.clipboard).toHaveBeenCalledExactlyOnceWith('data:image/png;base64,fixture')
    await act(async () => {
      await applyUsageShareAction('codex', 'x')
    })
    expect(effects.openUrl).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('https://x.com/intent/post?text=')
    )
    view.unmount()
    await expect(applyUsageShareAction('codex', 'copy')).rejects.toThrow('usage_share_unavailable')
  })
})
