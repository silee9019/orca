// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { readStatusBarViewerView, isStatusBarViewerMounted } from './status-bar-viewer-view'
afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})
it('reads only a visible bar and excludes collapsed provider chips', () => {
  expect(readStatusBarViewerView()).toBeNull()
  document.body.innerHTML =
    '<div data-status-bar-viewer data-status-bar-items="ports,codex" data-status-bar-percentage="used" data-status-bar-runtime="local#0"><span data-usage-chip="codex"><span data-usage-percentage-value="25" data-usage-percentage-display="used">25%</span></span><span data-usage-chip="claude" aria-hidden="true"><span data-usage-percentage-value="50" data-usage-percentage-display="used">50%</span></span></div>'
  const bounds = new DOMRect(0, 0, 100, 24)
  const root = document.querySelector<HTMLElement>('[data-status-bar-viewer]')
  if (!root) {
    throw new Error('missing_fixture')
  }
  vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(bounds)
  for (const chip of root.querySelectorAll<HTMLElement>(
    '[data-usage-chip], [data-usage-percentage-value]'
  )) {
    vi.spyOn(chip, 'getBoundingClientRect').mockReturnValue(bounds)
  }
  expect(readStatusBarViewerView()).toMatchObject({
    items: ['ports', 'codex'],
    providers: ['codex'],
    meters: [{ provider: 'codex', display: 'used', value: 25 }],
    percentageDisplay: 'used'
  })
  vi.spyOn(root, 'getBoundingClientRect').mockReturnValue(new DOMRect())
  expect(readStatusBarViewerView()).toBeNull()
  expect(isStatusBarViewerMounted()).toBe(true)
})
