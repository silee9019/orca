// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('@/store', () => ({
  useAppStore: (select: (state: { settings: { activeRuntimeEnvironmentId: null } }) => unknown) =>
    select({ settings: { activeRuntimeEnvironmentId: null } })
}))
import { useWorkspaceBoardViewerPublication } from './use-workspace-board-viewer-publication'
import {
  publishWorkspaceBoardControl,
  publishWorkspaceBoardView
} from './workspace-board-viewer-view'
import * as view from './workspace-board-viewer-view'

const noop = (): void => undefined
const makeControl = () => ({
  addStatus: noop,
  renameStatus: noop,
  changeStatusColor: noop,
  changeStatusIcon: noop,
  moveStatus: noop,
  removeStatus: noop,
  setColumnWidth: noop
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  publishWorkspaceBoardView(null)
  publishWorkspaceBoardControl(null)
})

it('publishes a copy of the statuses with the latest control and withdraws both on unmount', () => {
  const publishView = vi.spyOn(view, 'publishWorkspaceBoardView')
  const publishControl = vi.spyOn(view, 'publishWorkspaceBoardControl')
  const statuses = [{ id: 'todo', label: 'Todo', color: 'blue' }]
  const first = makeControl()
  const hook = renderHook((props) => useWorkspaceBoardViewerPublication(props), {
    initialProps: { open: true, statuses, columnWidth: 308, control: first }
  })
  expect(publishView).toHaveBeenLastCalledWith({
    runtimeContextKey: expect.any(String),
    open: true,
    columnWidth: 308,
    statuses: [{ id: 'todo', label: 'Todo', color: 'blue' }]
  })
  expect(publishView.mock.calls.at(-1)?.[0]?.statuses[0]).not.toBe(statuses[0])
  expect(publishControl).toHaveBeenLastCalledWith(first)
  const second = makeControl()
  hook.rerender({ open: true, statuses, columnWidth: 308, control: second })
  expect(publishControl).toHaveBeenLastCalledWith(second)
  hook.rerender({ open: false, statuses, columnWidth: 400, control: second })
  expect(publishView).toHaveBeenLastCalledWith(
    expect.objectContaining({ open: false, columnWidth: 400 })
  )
  hook.unmount()
  expect(publishView).toHaveBeenLastCalledWith(null)
  expect(publishControl).toHaveBeenLastCalledWith(null)
})
