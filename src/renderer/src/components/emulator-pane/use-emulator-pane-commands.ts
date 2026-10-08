import { useEffect, useRef, type RefObject } from 'react'
import { EmulatorFrameCommandEvent } from './emulator-frame-command'
export function useEmulatorPaneCommands(
  paneRef: RefObject<HTMLDivElement | null>,
  sendRotate: () => Promise<'portrait' | 'landscape' | null>,
  enabled: boolean
): void {
  const latest = useRef({ sendRotate, enabled })
  useEffect(() => {
    latest.current = { sendRotate, enabled }
  }, [sendRotate, enabled])
  useEffect(() => {
    const pane = paneRef.current
    if (!pane) {
      return
    }
    let active = true
    const listener = (event: Event) => {
      if (!(event instanceof EmulatorFrameCommandEvent) || event.action.type !== 'rotate') {
        return
      }
      event.completion = Promise.resolve().then(async () => {
        if (!latest.current.enabled) {
          throw new Error('emulator_not_interactable')
        }
        const visualOrientation = await latest.current.sendRotate()
        if (!active || !pane.isConnected || !visualOrientation) {
          throw new Error('emulator_rotation_applied_unknown')
        }
        return { streamError: false, streamSize: null, visualOrientation }
      })
    }
    pane.addEventListener('orca:emulator-frame-command', listener)
    return () => {
      active = false
      pane.removeEventListener('orca:emulator-frame-command', listener)
    }
  }, [paneRef])
}
