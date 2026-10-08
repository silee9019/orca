import { act } from 'react'
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import { settleHostQueries } from './automations-page-test-harness'
import { listedRow } from './automations-page-listed-items'

export async function mountDeleteViewerPage() {
  vi.resetModules()
  vi.doUnmock('./AutomationDeleteDialogs')
  const [{ default: Page }, { applyAutomationViewerAction: apply }] = await Promise.all([
    import('./AutomationsPage'),
    import('../../runtime/automation-viewer-controller')
  ])
  const view = render(<Page />)
  await settleHostQueries()
  async function request() {
    let pending: ReturnType<typeof apply> | undefined
    await act(async () => {
      pending = apply({
        kind: 'delete-form',
        action: { kind: 'request', source: 'local', rowKey: listedRow('a-1').key }
      })
    })
    const state = (await pending)?.deletion
    if (!state?.reviewedTarget) {
      throw new Error('missing deletion target')
    }
    return state.reviewedTarget
  }
  return { view, apply, request }
}
