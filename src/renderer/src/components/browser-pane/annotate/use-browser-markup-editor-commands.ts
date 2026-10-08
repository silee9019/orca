import { BrowserMarkupNormalizedPoints } from '../../../../../shared/rpc-contract/browser-markup-editor-params'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  BROWSER_MARKUP_EDITOR_COMMAND_EVENT,
  type BrowserMarkupEditorEvent,
  type BrowserMarkupEditorOwner
} from '@/runtime/browser-markup-editor-request'
import type { BrowserMarkupEditorState } from '../../../../../shared/rpc-contract/browser-markup-editor-params'
import { MARKUP_COLORS, MARKUP_WIDTHS, MARKUP_FONT_SIZES } from './markup-drawing-model'
import type { useMarkupEditor } from './useMarkupEditor'
type Editor = ReturnType<typeof useMarkupEditor>
function matchesOwner(
  owner: BrowserMarkupEditorOwner | undefined,
  request: BrowserMarkupEditorEvent
): boolean {
  return Boolean(
    owner &&
    owner.page === request.page &&
    Boolean(owner.clientTarget) === Boolean(request.clientTarget) &&
    (!request.clientTarget ||
      Object.entries(request.clientTarget).every(
        ([key, value]) => Reflect.get(owner.clientTarget ?? {}, key) === value
      ))
  )
}
function snapshot(editor: Editor, owner?: BrowserMarkupEditorOwner): BrowserMarkupEditorState {
  return {
    ...(owner?.clientTarget ? { clientTarget: owner.clientTarget } : {}),
    tool: editor.tool,
    color: editor.color,
    width: editor.width,
    fontSize: editor.fontSize,
    shapeCount: editor.shapes.length,
    pendingText: editor.pendingText !== null,
    gestureActive: editor.hasGesture,
    canUndo: editor.canUndo,
    canRedo: editor.canRedo
  }
}
export function useBrowserMarkupEditorCommands(
  owner: BrowserMarkupEditorOwner | undefined,
  busy: boolean,
  editor: Editor,
  copyVerified?: (stillCurrent: () => boolean) => Promise<boolean>
): void {
  const currentOwner = useRef(owner)
  const current = useRef(editor)
  const copying = useRef(false)
  const mounted = useRef(true)
  const active = useRef(owner?.active ?? false)
  useLayoutEffect(() => {
    currentOwner.current = owner
    active.current = owner?.active ?? false
  })
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const pending = useRef<{
    request: BrowserMarkupEditorEvent
    check: (value: Editor) => boolean
    isCurrent?: () => boolean
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
      const accepted =
        !!owner?.active &&
        operation.isCurrent?.() !== false &&
        owner.isCurrent?.() !== false &&
        matchesOwner(owner, operation.request) &&
        !busy &&
        operation.check(current.current)
      operation.request.finish(
        accepted ? undefined : new Error('browser_markup_edit_not_applied'),
        snapshot(current.current, owner)
      )
    }
    pending.current = null
  })
  useEffect(() => {
    const receive = (event: WindowEventMap['orca:browser-markup-editor-command']): void => {
      const request = event.detail
      if (!owner || !matchesOwner(owner, request)) {
        return
      }
      request.offer(owner.active && owner.isCurrent?.() !== false, () => {
        if (Date.now() >= request.expiresAt) {
          request.finish(new Error('request_expired'))
          return
        }
        if (!owner.active || owner.isCurrent?.() === false) {
          request.finish(new Error('browser_markup_viewer_inactive'))
          return
        }
        if (request.command.action === 'status') {
          request.finish(undefined, snapshot(current.current, owner))
          return
        }
        if (busy) {
          request.finish(new Error('browser_markup_composing'))
          return
        }
        if (copying.current || (pending.current && !pending.current.request.isSettled())) {
          request.finish(new Error('browser_markup_editor_busy'))
          return
        }
        const command = request.command
        const before = current.current
        if (command.action === 'copy') {
          if (!copyVerified || before.pendingText) {
            request.finish(new Error('browser_markup_copy_unavailable'))
            return
          }
          copying.current = true
          const stillCurrent = () =>
            mounted.current &&
            active.current &&
            owner.isCurrent?.() !== false &&
            matchesOwner(currentOwner.current, request) &&
            currentOwner.current?.isCurrent?.() !== false &&
            !request.isSettled() &&
            Date.now() < request.expiresAt
          void copyVerified(stillCurrent)
            .then(
              (copied) => {
                request.finish(
                  copied ? undefined : new Error('browser_markup_copy_effect_unknown'),
                  {
                    ...snapshot(before, owner),
                    ...(copied ? { copied: true as const } : {})
                  }
                )
              },
              () => request.finish(new Error('browser_markup_copy_effect_unknown'))
            )
            .finally(() => {
              copying.current = false
            })
          return
        }
        let check: (value: Editor) => boolean
        if (command.action === 'gesture') {
          if (
            !BrowserMarkupNormalizedPoints.safeParse(command.points).success ||
            before.hasGesture ||
            before.pendingText ||
            !before.runNormalizedGesture(command.points, command.cancel)
          ) {
            request.finish(new Error('browser_markup_gesture_unavailable'))
            return
          }
          const first = command.points[0]
          const last = command.points.at(-1)
          const empty =
            before.tool !== 'pen' &&
            before.tool !== 'highlight' &&
            first?.x === last?.x &&
            first?.y === last?.y
          check = (value) =>
            !value.hasGesture &&
            (before.tool === 'text'
              ? value.pendingText !== null
              : command.cancel || (empty && before.tool !== 'eraser')
                ? value.shapes === before.shapes
                : before.tool === 'eraser'
                  ? value.shapes.every((shape) => before.shapes.some((old) => old.id === shape.id))
                  : value.shapes.length === before.shapes.length + 1 &&
                    value.shapes.some(
                      (shape) =>
                        shape.kind === before.tool &&
                        !before.shapes.some((old) => old.id === shape.id)
                    ))
        } else if (command.action === 'text-commit' || command.action === 'text-cancel') {
          if (!before.pendingText) {
            request.finish(new Error('browser_markup_text_not_pending'))
            return
          }
          if (command.action === 'text-cancel') {
            before.cancelPendingText()
            check = (value) => value.pendingText === null && value.shapes === before.shapes
          } else {
            const text = command.text.trim()
            before.commitPendingText(command.text)
            check = (value) =>
              value.pendingText === null &&
              (text.length === 0
                ? value.shapes === before.shapes
                : value.shapes.length === before.shapes.length + 1 &&
                  value.shapes.some(
                    (shape) =>
                      shape.kind === 'text' &&
                      shape.text === text &&
                      !before.shapes.some((previous) => previous.id === shape.id)
                  ))
          }
        } else if (command.action === 'tool') {
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
        pending.current = { request, check, isCurrent: owner.isCurrent }
        update((value) => value + 1)
      })
    }
    window.addEventListener(BROWSER_MARKUP_EDITOR_COMMAND_EVENT, receive)
    return () => window.removeEventListener(BROWSER_MARKUP_EDITOR_COMMAND_EVENT, receive)
  }, [owner, busy, copyVerified])
  useEffect(
    () => () => {
      pending.current?.request.finish(new Error('browser_markup_editor_ui_unavailable'))
      pending.current = null
    },
    [owner?.page]
  )
}
