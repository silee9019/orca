// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  ActivityThreadCollapseContext,
  type ActivityThreadCollapseState
} from './activity-thread-collapse-context'
import { useActivityThreadGroupCollapse } from './use-activity-thread-group-collapse'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const context = { collapsedGroupKeys: new Set(['context']), onToggleGroupCollapse: vi.fn() }
let root: Root
let container: HTMLDivElement
let latest: ActivityThreadCollapseState | null = null
function Probe(props: Partial<ActivityThreadCollapseState>): null {
  latest = useActivityThreadGroupCollapse(props)
  return null
}
function current(): ActivityThreadCollapseState {
  if (!latest) {
    throw new Error('collapse state unavailable')
  }
  return latest
}
beforeEach(() => {
  vi.clearAllMocks()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  latest = null
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})
it('keeps uncontrolled toggles in pane-local state', () => {
  act(() => root.render(<Probe />))
  act(() => current().onToggleGroupCollapse('status:done'))
  expect([...current().collapsedGroupKeys]).toEqual(['status:done'])
  act(() => current().onToggleGroupCollapse('status:done'))
  expect([...current().collapsedGroupKeys]).toEqual([])
})
it('prioritizes complete controlled props over caller context without mutating either set', () => {
  const controlled = { collapsedGroupKeys: new Set(['controlled']), onToggleGroupCollapse: vi.fn() }
  act(() =>
    root.render(
      <ActivityThreadCollapseContext.Provider value={context}>
        <Probe {...controlled} />
      </ActivityThreadCollapseContext.Provider>
    )
  )
  expect([...current().collapsedGroupKeys]).toEqual(['controlled'])
  current().onToggleGroupCollapse('next')
  expect(controlled.onToggleGroupCollapse).toHaveBeenCalledExactlyOnceWith('next')
  expect(context.onToggleGroupCollapse).not.toHaveBeenCalled()
  expect([...controlled.collapsedGroupKeys]).toEqual(['controlled'])
  expect([...context.collapsedGroupKeys]).toEqual(['context'])
})
it('uses caller context for incomplete controlled props and preserves it across pane remounts', () => {
  const render = () =>
    act(() =>
      root.render(
        <ActivityThreadCollapseContext.Provider value={context}>
          <Probe collapsedGroupKeys={new Set(['ignored'])} />
        </ActivityThreadCollapseContext.Provider>
      )
    )
  render()
  expect([...current().collapsedGroupKeys]).toEqual(['context'])
  current().onToggleGroupCollapse('next')
  expect(context.onToggleGroupCollapse).toHaveBeenCalledExactlyOnceWith('next')
  act(() => root.render(null))
  render()
  expect([...current().collapsedGroupKeys]).toEqual(['context'])
})
