// @vitest-environment happy-dom
import { useState } from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useSidebarResize } from '@/hooks/useSidebarResize'
import { ActivityThreadListResizeHandle } from '@/components/activity/activity-thread-list-resize-handle'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import { applyActivityViewerRequest } from './activity-viewer-bridge'

const fixture = vi.hoisted(() => {
  const localSettings = (): { activeRuntimeEnvironmentId: string | null } | null => ({
    activeRuntimeEnvironmentId: null
  })
  return {
    listeners: new Set<() => void>(),
    state: {
      persistedUIReady: true,
      settings: localSettings(),
      activeView: 'activity',
      agentsGroupBy: 'none',
      agentsReadFilter: 'all',
      agentsCompactMode: false,
      agentsShowChildAgents: true
    },
    saved: vi.fn<(width: number) => void>(),
    commitWidth: true
  }
})
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => fixture.state,
    subscribe: (listener: () => void) => {
      fixture.listeners.add(listener)
      return () => fixture.listeners.delete(listener)
    }
  }
}))
vi.mock('./activity-viewer-view', () => ({
  readActivityViewerView: () => ({
    runtimeContextKey: getProviderRuntimeContextKey(fixture.state.settings)
  })
}))
function List() {
  const [width, setWidth] = useState(480)
  const resize = useSidebarResize<HTMLDivElement>({
    isOpen: true,
    width,
    minWidth: 320,
    maxWidth: 720,
    deltaSign: 1,
    setWidth: (value) => {
      fixture.saved(value)
      if (fixture.commitWidth) {
        setWidth(value)
      }
    }
  })
  return (
    <aside
      ref={resize.containerRef}
      data-activity-viewer="activity-page"
      data-activity-list-width={width}
    >
      <ActivityThreadListResizeHandle
        isResizing={resize.isResizing}
        onResizeStart={resize.onResizeStart}
      />
    </aside>
  )
}
const run = (width: number) =>
  applyActivityViewerRequest({
    id: 'resize',
    expiresAt: Date.now() + 180,
    command: { viewer: 'host', surface: 'activity-page', operation: 'resize', width }
  })
beforeEach(() => {
  fixture.saved.mockClear()
  fixture.commitWidth = true
  fixture.state.settings = { activeRuntimeEnvironmentId: null }
  fixture.state.activeView = 'activity'
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    return new DOMRect(0, 0, Number.parseFloat(this.style.width) || 10, 600)
  })
  render(<List />)
})
afterEach(() => {
  cleanup()
  document.body.replaceChildren()
  expect(fixture.listeners.size).toBe(0)
  expect(document.body.style.cursor).toBe('')
  expect(document.body.style.userSelect).toBe('')
  vi.restoreAllMocks()
})
it.each([
  [600, 600],
  [1, 320],
  [1000, 720]
])('uses the original drag and clamp for %s', async (width, expected) => {
  let request: ReturnType<typeof run> | undefined
  act(() => {
    request = run(width)
  })
  expect(await request).toMatchObject({
    applied: true,
    persisted: null,
    resizeAction: { requestedWidth: width, targetWidth: expected, renderedWidth: expected }
  })
  expect(fixture.saved).toHaveBeenCalledExactlyOnceWith(expected)
  expect(document.querySelector('[data-activity-list-resizing="true"]')).toBeNull()
})
it('rejects an existing drag without starting another', async () => {
  document.body.style.cursor = 'col-resize'
  await expect(run(600)).rejects.toThrow('activity_resize_unavailable')
  expect(fixture.saved).not.toHaveBeenCalled()
  document.body.style.cursor = ''
})
it('rejects hidden or detached controls before starting', async () => {
  const root = document.querySelector<HTMLElement>('[data-activity-viewer]')
  if (!root) {
    throw new Error('fixture_missing')
  }
  root.hidden = true
  await expect(run(600)).rejects.toThrow('activity_resize_unavailable')
  expect(fixture.saved).not.toHaveBeenCalled()
})

it('does not accept an inert marker whose width already matches', async () => {
  cleanup()
  const root = document.createElement('aside')
  root.dataset.activityViewer = 'activity-page'
  root.style.width = '600px'
  const handle = document.createElement('div')
  handle.dataset.activityListResize = ''
  root.append(handle)
  document.body.append(root)
  await expect(run(600)).rejects.toThrow('activity_resize_not_started')
  root.remove()
})

it('fences a view departure and return during the original drag', async () => {
  const leave = () => {
    fixture.state.activeView = 'settings'
    for (const listener of fixture.listeners) {
      listener()
    }
    fixture.state.activeView = 'activity'
    for (const listener of fixture.listeners) {
      listener()
    }
  }
  window.addEventListener('mousemove', leave, { once: true })
  let request: ReturnType<typeof run> | undefined
  act(() => {
    request = run(600)
  })
  expect(await request).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
  expect(fixture.saved).toHaveBeenCalledExactlyOnceWith(600)
})
it('sends mouseup cleanup even when move dispatch throws', async () => {
  const original = window.dispatchEvent.bind(window)
  const dispatch = vi.spyOn(window, 'dispatchEvent').mockImplementation((event) => {
    if (event.type === 'mousemove') {
      throw new Error('move_failed')
    }
    return original(event)
  })
  let request: ReturnType<typeof run> | undefined
  act(() => {
    request = run(600)
  })
  await expect(request).rejects.toThrow('move_failed')
  expect(dispatch.mock.calls.filter(([event]) => event.type === 'mouseup')).toHaveLength(1)
})

it('requires the React committed width after the imperative drag stops', async () => {
  fixture.commitWidth = false
  let request: ReturnType<typeof run> | undefined
  act(() => {
    request = run(600)
  })
  expect(await request).toMatchObject({ applied: false, resizeAction: { renderedWidth: 600 } })
  expect(fixture.saved).toHaveBeenCalledExactlyOnceWith(600)
})
it('executes one original drag even for an unchanged width', async () => {
  const handle = document.querySelector<HTMLElement>('[data-activity-list-resize]')
  if (!handle) {
    throw new Error('fixture_missing')
  }
  const started = vi.fn()
  handle.addEventListener('mousedown', started)
  let request: ReturnType<typeof run> | undefined
  act(() => {
    request = run(480)
  })
  expect(await request).toMatchObject({ applied: true })
  expect(started).toHaveBeenCalledTimes(1)
  expect(fixture.saved).not.toHaveBeenCalled()
})
it.each(['runtime', 'session'])('fences %s loss during the drag', async (kind) => {
  window.addEventListener(
    'mousemove',
    () => {
      fixture.state.settings = kind === 'runtime' ? { activeRuntimeEnvironmentId: 'other' } : null
      for (const listener of fixture.listeners) {
        listener()
      }
    },
    { once: true }
  )
  let request: ReturnType<typeof run> | undefined
  act(() => {
    request = run(600)
  })
  expect(await request).toMatchObject({ applied: false, reason: 'viewer_runtime_changed' })
})
it.each(['root', 'handle'])('rejects %s replacement during the original drag', async (kind) => {
  const source = document.querySelector<HTMLElement>(
    kind === 'root' ? '[data-activity-viewer]' : '[data-activity-list-resize]'
  )
  if (!source) {
    throw new Error('fixture_missing')
  }
  const replacement = source.cloneNode(true)
  window.addEventListener(
    'mousemove',
    () => {
      source.replaceWith(replacement)
    },
    { once: true }
  )
  let request: ReturnType<typeof run> | undefined
  act(() => {
    request = run(600)
  })
  expect(await request).toMatchObject({ applied: false, reason: 'viewer_surface_superseded' })
  replacement.parentNode?.replaceChild(source, replacement)
})
