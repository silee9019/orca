import { useEffect, useRef, type RefObject, type WheelEvent } from 'react'
import type { EmulatorFrameState } from '../../../../shared/emulator-frame-command'
import type { EmulatorKeyboardPasteResult } from './emulator-keyboard-paste'
import { EmulatorFrameCommandEvent } from './emulator-frame-command'
import { dispatchEmulatorPointerSequence } from './emulator-pointer-command'

export function useEmulatorFrameCommands(
  paneRef: RefObject<HTMLDivElement | null>,
  state: EmulatorFrameState,
  canInteract: boolean,
  onWheel: (
    event: Pick<
      WheelEvent<HTMLDivElement>,
      'clientX' | 'clientY' | 'deltaX' | 'deltaY' | 'deltaMode' | 'currentTarget' | 'preventDefault'
    >
  ) => void,
  pasteText: (text: string) => Promise<EmulatorKeyboardPasteResult>
): void {
  const latest = useRef({ state, canInteract, onWheel, pasteText })
  useEffect(() => {
    latest.current = { state, canInteract, onWheel, pasteText }
  }, [state, canInteract, onWheel, pasteText])
  useEffect(() => {
    const pane = paneRef.current
    if (!pane) {
      return
    }
    let active = true
    const listener = (event: Event): void => {
      if (!(event instanceof EmulatorFrameCommandEvent)) {
        return
      }
      const action = event.action
      if (
        action.type === 'rotate' ||
        action.type === 'attach-view' ||
        action.type === 'shutdown-view' ||
        action.type === 'focus-group' ||
        action.type === 'select-tab'
      ) {
        return
      }
      const owner = latest.current
      if (!owner.canInteract) {
        event.completion = Promise.reject(new Error('emulator_not_interactable'))
        return
      }
      const screen = pane.querySelector<HTMLDivElement>('[data-emulator-screen]')
      if (
        !screen ||
        ((action.type === 'wheel' || action.type === 'pointer') &&
          (screen.getBoundingClientRect().width <= 0 || screen.getBoundingClientRect().height <= 0))
      ) {
        event.completion = Promise.reject(new Error('emulator_frame_unavailable'))
        return
      }
      if (action.type === 'paste') {
        event.completion = owner.pasteText(action.text).then((result) => {
          if (result.status !== 'sent') {
            throw new Error(`emulator_paste_${result.status}`)
          }
          if (!active || !pane.isConnected) {
            throw new Error('emulator_frame_applied_unknown')
          }
          return latest.current.state
        })
        return
      }
      if (action.type === 'pointer') {
        try {
          dispatchEmulatorPointerSequence(screen, action)
        } catch (error) {
          event.completion = Promise.reject(error)
          return
        }
      } else if (action.type === 'key') {
        const key = new KeyboardEvent('keydown', {
          key: action.key,
          shiftKey: action.shift,
          bubbles: true,
          cancelable: true
        })
        screen.dispatchEvent(key)
        if (!key.defaultPrevented) {
          event.completion = Promise.reject(new Error('emulator_key_not_handled'))
          return
        }
      } else {
        owner.onWheel({ ...action, currentTarget: screen, preventDefault: () => {} })
      }
      event.completion = new Promise((resolve, reject) => {
        setTimeout(
          () => {
            if (!active || !pane.isConnected) {
              reject(new Error('emulator_frame_unavailable'))
              return
            }
            const result = latest.current.state
            resolve(result)
          },
          action.type === 'wheel' ? 120 : 0
        )
      })
    }
    pane.addEventListener('orca:emulator-frame-command', listener)
    return () => {
      active = false
      pane.removeEventListener('orca:emulator-frame-command', listener)
    }
  }, [paneRef])
}
