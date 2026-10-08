// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest'
import {
  publishWorkspaceBoardControl,
  publishWorkspaceBoardView,
  readWorkspaceBoardControl,
  readWorkspaceBoardView
} from './workspace-board-viewer-view'

const snapshot = {
  runtimeContextKey: 'local#0',
  open: true,
  columnWidth: 308,
  statuses: [{ id: 'todo', label: 'Todo' }]
}
const control = {
  addStatus: () => undefined,
  renameStatus: () => undefined,
  changeStatusColor: () => undefined,
  changeStatusIcon: () => undefined,
  moveStatus: () => undefined,
  removeStatus: () => undefined,
  setColumnWidth: () => undefined
}
const mountBoard = (width = 300): HTMLElement => {
  const node = document.createElement('div')
  node.setAttribute('data-workspace-board-selection-surface', '')
  node.getBoundingClientRect = () => new DOMRect(0, 0, width, 400)
  document.body.append(node)
  return node
}
afterEach(() => {
  document.body.replaceChildren()
  publishWorkspaceBoardView(null)
  publishWorkspaceBoardControl(null)
})

it('exposes the view and control only while an open board is mounted and measured', () => {
  publishWorkspaceBoardView(snapshot)
  publishWorkspaceBoardControl(control)
  expect(readWorkspaceBoardView()).toBeNull()
  expect(readWorkspaceBoardControl()).toBeNull()
  const node = mountBoard(0)
  expect(readWorkspaceBoardView()).toBeNull()
  node.getBoundingClientRect = () => new DOMRect(0, 0, 300, 400)
  expect(readWorkspaceBoardView()).toEqual(snapshot)
  expect(readWorkspaceBoardControl()).toBe(control)
})
it('hides a board that is closing while its drawer still lingers', () => {
  mountBoard()
  publishWorkspaceBoardView({ ...snapshot, open: false })
  publishWorkspaceBoardControl(control)
  expect(readWorkspaceBoardView()).toBeNull()
  expect(readWorkspaceBoardControl()).toBeNull()
  publishWorkspaceBoardView(null)
  expect(readWorkspaceBoardControl()).toBeNull()
})
