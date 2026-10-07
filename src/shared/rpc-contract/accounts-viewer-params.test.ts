import { expect, it } from 'vitest'
import { AccountsViewerParams } from './accounts-viewer-params'

it('never includes private input or unknown property names in validation errors', () => {
  const sentinel = 'fixture-private-validation-sentinel'
  const parsed = AccountsViewerParams.safeParse({
    viewer: 'desktop',
    action: { type: 'open-settings', pane: 'accounts', [sentinel]: sentinel },
    [sentinel]: sentinel
  })
  expect(parsed.success).toBe(false)
  if (!parsed.success) {
    expect(parsed.error.message).not.toContain(sentinel)
    expect(JSON.stringify(parsed.error.issues)).not.toContain(sentinel)
  }
})
