import { expect, it } from 'vitest'
import { BrowserViewerCommand } from './browser-viewer-params'
import {
  BrowserTabDropViewerCommand,
  BrowserTabDragCancelViewerCommand
} from './browser-tab-drop-params'
const target = {
  workspace: 'browser',
  worktree: 'folder',
  group: 'left',
  unifiedTab: 'tab',
  environmentId: null
}
it('retains and validates the host viewer in resolved drop commands', () => {
  const command = {
    viewer: 'host',
    operation: 'tab-drop',
    target,
    destination: { kind: 'pane', group: 'right' }
  }
  expect(BrowserViewerCommand.parse(command)).toEqual(command)
  expect(BrowserTabDropViewerCommand.parse(command)).toEqual(command)
  expect(BrowserTabDropViewerCommand.safeParse({ ...command, viewer: 'other' }).success).toBe(false)
})
it('retains and validates the host viewer in active gesture cancellation commands', () => {
  const command = { viewer: 'host', operation: 'tab-drag-cancel', target }
  expect(BrowserViewerCommand.parse(command)).toEqual(command)
  expect(BrowserTabDragCancelViewerCommand.parse(command)).toEqual(command)
  expect(BrowserTabDragCancelViewerCommand.safeParse({ ...command, viewer: 'other' }).success).toBe(
    false
  )
})
