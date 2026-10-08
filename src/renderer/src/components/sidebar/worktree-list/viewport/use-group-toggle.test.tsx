// @vitest-environment happy-dom

import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { VIRTUALIZED_SCROLL_ANCHOR_RECORD_EVENT } from '@/hooks/useVirtualizedScrollAnchor'
import {
  publishWorkspaceListCollapseControl,
  readWorkspaceListCollapseControl
} from '@/runtime/workspace-list-viewer-view'
import { useGroupToggleWithScrollAnchor } from './use-group-toggle'

function mountMeasuredList(): HTMLDivElement {
  const node = document.createElement('div')
  node.setAttribute('data-worktree-sidebar-container', '')
  node.getBoundingClientRect = () => new DOMRect(0, 0, 250, 400)
  document.body.append(node)
  return node
}

afterEach(() => {
  cleanup()
  publishWorkspaceListCollapseControl(null)
  document.body.replaceChildren()
})

it('publishes the toggle that records the scroll anchor first, and withdraws it on unmount', () => {
  const scroller = mountMeasuredList()
  const order: string[] = []
  scroller.addEventListener(VIRTUALIZED_SCROLL_ANCHOR_RECORD_EVENT, () => order.push('anchor'))
  const toggleGroup = vi.fn((key: string) => order.push(`toggle:${key}`))
  const view = renderHook(() =>
    useGroupToggleWithScrollAnchor({ scrollRef: { current: scroller }, toggleGroup })
  )
  readWorkspaceListCollapseControl()?.toggle('repo:one')
  expect(order).toEqual(['anchor', 'toggle:repo:one'])
  view.unmount()
  expect(readWorkspaceListCollapseControl()).toBeNull()
})
