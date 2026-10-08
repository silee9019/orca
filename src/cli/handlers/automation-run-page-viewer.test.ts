import { expect, it } from 'vitest'
import { AutomationViewerActionSchema } from '../../shared/automation-viewer-command'
const reviewedTarget = '00000000-0000-4000-8000-000000000001'
it('accepts strict reviewed run page controls under the public automation viewer', () => {
  for (const kind of ['back', 'open-workspace', 'rerun']) {
    expect(
      AutomationViewerActionSchema.safeParse({
        kind: 'run-page-form',
        action: { kind, reviewedTarget }
      }).success
    ).toBe(true)
    expect(
      AutomationViewerActionSchema.safeParse({ kind: 'run-page-form', action: { kind } }).success
    ).toBe(false)
  }
  expect(
    AutomationViewerActionSchema.safeParse({ kind: 'run-page-form', action: { kind: 'get' } })
      .success
  ).toBe(true)
  expect(
    AutomationViewerActionSchema.safeParse({
      kind: 'run-page-form',
      action: { kind: 'back', reviewedTarget, force: true }
    }).success
  ).toBe(false)
})
