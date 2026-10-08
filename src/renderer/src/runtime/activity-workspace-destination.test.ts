import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { readActivityWorkspaceDestination } from './activity-workspace-destination'

const ancestor = {
  parentElement: null,
  hidden: false,
  inert: false,
  style: { display: 'block', visibility: 'visible', opacity: '1' },
  getAttribute: vi.fn<(name: string) => string | null>()
}
const root = {
  parentElement: ancestor,
  hidden: false,
  inert: false,
  isConnected: true,
  dataset: { renderedActiveWorktreeId: 'workspace', renderedActiveExecutionHostId: 'ssh:owner' },
  style: { display: 'block', visibility: 'visible', opacity: '1' },
  getAttribute: vi.fn<(name: string) => string | null>(),
  getBoundingClientRect: vi.fn(() => ({ width: 800, height: 600 }))
}
beforeEach(() => {
  Object.assign(ancestor, { hidden: false, inert: false })
  Object.assign(root, { hidden: false, inert: false, isConnected: true })
  Object.assign(root.dataset, {
    renderedActiveWorktreeId: 'workspace',
    renderedActiveExecutionHostId: 'ssh:owner'
  })
  Object.assign(ancestor.style, { display: 'block', visibility: 'visible', opacity: '1' })
  root.getAttribute.mockReturnValue(null)
  ancestor.getAttribute.mockReturnValue(null)
  root.getBoundingClientRect.mockReturnValue({ width: 800, height: 600 })
  vi.stubGlobal('document', { querySelectorAll: () => [root] })
  vi.stubGlobal('getComputedStyle', (element: typeof ancestor) => element.style)
})
afterEach(() => vi.unstubAllGlobals())
it('reads the committed workspace and exact resolved host from the visible consumer', () => {
  expect(readActivityWorkspaceDestination('workspace', 'ssh:owner')).toBe(true)
  expect(readActivityWorkspaceDestination('workspace', 'local')).toBe(false)
  expect(readActivityWorkspaceDestination('different', 'ssh:owner')).toBe(false)
  root.dataset.renderedActiveExecutionHostId = ''
  expect(readActivityWorkspaceDestination('workspace', 'ssh:owner')).toBe(false)
})
it.each(['opacity', 'display', 'visibility', 'hidden', 'inert', 'aria-hidden'])(
  'rejects an ancestor retained through %s even with a positive root rectangle',
  (kind) => {
    if (kind === 'opacity') {
      ancestor.style.opacity = '0'
    }
    if (kind === 'display') {
      ancestor.style.display = 'none'
    }
    if (kind === 'visibility') {
      ancestor.style.visibility = 'hidden'
    }
    if (kind === 'hidden') {
      ancestor.hidden = true
    }
    if (kind === 'inert') {
      ancestor.inert = true
    }
    if (kind === 'aria-hidden') {
      ancestor.getAttribute.mockImplementation((name) => (name === 'aria-hidden' ? 'true' : null))
    }
    expect(readActivityWorkspaceDestination('workspace', 'ssh:owner')).toBe(false)
  }
)
it.each([0, -1, Number.NaN, Infinity])('rejects an unmeasurable width %s', (width) => {
  root.getBoundingClientRect.mockReturnValue({ width, height: 600 })
  expect(readActivityWorkspaceDestination('workspace', 'ssh:owner')).toBe(false)
})
it('rejects a detached or inert root', () => {
  root.isConnected = false
  expect(readActivityWorkspaceDestination('workspace', 'ssh:owner')).toBe(false)
  root.isConnected = true
  root.inert = true
  expect(readActivityWorkspaceDestination('workspace', 'ssh:owner')).toBe(false)
})
