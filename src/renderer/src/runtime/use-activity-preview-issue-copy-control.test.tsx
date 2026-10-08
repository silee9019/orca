// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useActivityPreviewIssueCopyControl } from './use-activity-preview-issue-copy-control'
import { readActivityPreviewIssueCopyControl } from './activity-preview-issue-copy-controls'
afterEach(cleanup)
function Preview({
  mounted,
  url,
  copy
}: {
  mounted: boolean
  url: string | undefined
  copy: () => Promise<boolean>
}) {
  const ref = useActivityPreviewIssueCopyControl(url, copy)
  return mounted ? <div ref={ref} data-testid="preview" /> : null
}
it('publishes when the portaled DOM appears after the first component commit and withdraws on unmount', () => {
  const copy = vi.fn(async () => true)
  const props = { mounted: false, url: 'https://example.com/issue', copy }
  const view = render(<Preview {...props} />)
  view.rerender(<Preview {...props} mounted />)
  const portal = screen.getByTestId('preview')
  const lease = readActivityPreviewIssueCopyControl(portal)
  expect(lease?.copy).toBe(copy)
  view.unmount()
  expect(lease?.isCurrent()).toBe(false)
})
it('binds only the latest committed callback and URL and never revives the captured lease', () => {
  const copy = vi.fn(async () => true)
  const props = { mounted: true, url: 'https://example.com/original', copy }
  const view = render(<Preview {...props} />)
  const portal = screen.getByTestId('preview')
  const original = readActivityPreviewIssueCopyControl(portal)
  const nextCopy = vi.fn(async () => false)
  view.rerender(<Preview {...props} url="https://example.com/other" copy={nextCopy} />)
  expect(original?.isCurrent()).toBe(false)
  expect(readActivityPreviewIssueCopyControl(portal)?.copy).toBe(nextCopy)
  view.rerender(<Preview {...props} />)
  expect(original?.isCurrent()).toBe(false)
  expect(readActivityPreviewIssueCopyControl(portal)?.url).toBe(props.url)
  view.rerender(<Preview {...props} url={undefined} />)
  expect(readActivityPreviewIssueCopyControl(portal)).toBeNull()
})
