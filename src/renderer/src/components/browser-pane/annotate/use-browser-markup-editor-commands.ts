import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  BROWSER_MARKUP_EDITOR_COMMAND_EVENT,
  type BrowserMarkupEditorEvent
} from '@/runtime/browser-markup-editor-request'
import type { BrowserMarkupEditorState } from '../../../../../shared/rpc-contract/browser-markup-editor-params'
import { MARKUP_COLORS, MARKUP_WIDTHS, MARKUP_FONT_SIZES } from './markup-drawing-model'
import type { useMarkupEditor } from './useMarkupEditor'
type Editor = ReturnType<typeof useMarkupEditor>
function snapshot(editor: Editor): BrowserMarkupEditorState {
  return {
    tool: editor.tool,
    color: editor.color,
    width: editor.width,
    fontSize: editor.fontSize,
    shapeCount: editor.shapes.length,
    pendingText: editor.pendingText !== null,
    canUndo: editor.canUndo,
    canRedo: editor.canRedo
  }
}
export function useBrowserMarkupEditorCommands(
  owner: { page: string; active: boolean } | undefined,
  busy: boolean,
  editor: Editor
): void {
  const current = useRef(editor)
  const pending = useRef<{
    request: BrowserMarkupEditorEvent
    check: (value: Editor) => boolean
  } | null>(null)
  const [, update] = useState(0)
  useLayoutEffect(() => {
    current.current = editor
  })
  useEffect(() => {
    const operation = pending.current
    if (!operation) {
      return
    }
    if (!operation.request.isSettled()) {
      const accepted = !!owner?.active && !busy && operation.check(current.current)
      operation.request.finish(
        accepted ? undefined : new Error('browser_markup_edit_not_applied'),
        snapshot(current.current)
      )
    }
    pending.current = null
  })
  useEffect(() => {
    const receive = (event: WindowEventMap['orca:browser-markup-editor-command']): void => {
      const request = event.detail
      if (!owner || request.page !== owner.page || !request.claim()) {
        return
      }
      if (Date.now() >= request.expiresAt) {
        request.finish(new Error('request_expired'))
        return
      }
      if (!owner.active) {
        request.finish(new Error('browser_markup_viewer_inactive'))
        return
      }
      if (request.command.action === 'status') {
        request.finish(undefined, snapshot(current.current))
        return
      }
      if (busy) {
        request.finish(new Error('browser_markup_composing'))
        return
      }
      if (pending.current && !pending.current.request.isSettled()) {
        request.finish(new Error('browser_markup_editor_busy'))
        return
      }
      const command = request.command
      const before = current.current
      let check: (value: Editor) => boolean
      if (command.action === 'tool') {
        before.setTool(command.value)
        check = (value) => value.tool === command.value
      } else if (command.action === 'color') {
        if (!MARKUP_COLORS.some((value) => value === command.value)) {
          request.finish(new Error('invalid_markup_setting'))
          return
        }
        before.setColor(command.value)
        check = (value) => value.color === command.value
      } else if (command.action === 'width') {
        if (!MARKUP_WIDTHS.some((value) => value === command.value)) {
          request.finish(new Error('invalid_markup_setting'))
          return
        }
        before.setWidth(command.value)
        check = (value) => value.width === command.value
      } else if (command.action === 'font-size') {
        if (!MARKUP_FONT_SIZES.some((value) => value === command.value)) {
          request.finish(new Error('invalid_markup_setting'))
          return
        }
        before.setFontSize(command.value)
        check = (value) => value.fontSize === command.value
      } else if (command.action === 'clear') {
        before.clear()
        check = (value) => value.shapes.length === 0 && value.pendingText === null
      } else {
        if (!(command.action === 'undo' ? before.canUndo : before.canRedo)) {
          request.finish(new Error('browser_markup_history_unavailable'))
          return
        }
        if (command.action === 'undo') {
          before.undo()
        } else {
          before.redo()
        }
        check = (value) => value.shapes !== before.shapes
      }
      pending.current = { request, check }
      update((value) => value + 1)
    }
    window.addEventListener(BROWSER_MARKUP_EDITOR_COMMAND_EVENT, receive)
    return () => window.removeEventListener(BROWSER_MARKUP_EDITOR_COMMAND_EVENT, receive)
  }, [owner, busy])
  useEffect(
    () => () => {
      pending.current?.request.finish(new Error('browser_markup_editor_ui_unavailable'))
      pending.current = null
    },
    [owner?.page]
  )
}
