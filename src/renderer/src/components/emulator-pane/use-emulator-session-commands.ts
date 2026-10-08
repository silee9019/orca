import { useEffect, useRef, useState, type RefObject } from 'react'
import { EmulatorFrameCommandEvent } from './emulator-frame-command'
import type { useEmulatorPaneSession } from './use-emulator-pane-session'
import type { EmulatorFrameState } from '../../../../shared/emulator-frame-command'

type Session = ReturnType<typeof useEmulatorPaneSession>
type Pending = {
  device: string
  attached: boolean
  done: boolean
  resolve: (state: EmulatorFrameState) => void
  reject: (error: Error) => void
}

export function useEmulatorSessionCommands(
  paneRef: RefObject<HTMLDivElement | null>,
  session: Session
): void {
  const latest = useRef(session)
  const pending = useRef<Pending | null>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    latest.current = session
    const request = pending.current
    if (!request?.done || session.loading) {
      return
    }
    pending.current = null
    if (
      session.error ||
      session.selectedUdid !== request.device ||
      session.isLive !== request.attached
    ) {
      request.reject(new Error('emulator_session_not_applied'))
      return
    }
    request.resolve({
      streamError: false,
      streamSize: null,
      sessionState: {
        selectedUdid: session.selectedUdid,
        isLive: session.isLive,
        loading: false,
        displayName: session.displayName
      }
    })
  }, [session, revision])
  useEffect(() => {
    const pane = paneRef.current
    if (!pane) {
      return
    }
    let active = true
    const receive = (event: Event) => {
      if (!(event instanceof EmulatorFrameCommandEvent)) {
        return
      }
      const action = event.action
      if (action.type !== 'attach-view' && action.type !== 'shutdown-view') {
        return
      }
      const owner = latest.current
      if (
        pending.current ||
        owner.loading ||
        (action.type === 'shutdown-view' && owner.selectedUdid !== action.device)
      ) {
        event.completion = Promise.reject(new Error('emulator_session_busy_or_target_changed'))
        return
      }
      event.completion = new Promise((resolve, reject) => {
        const request: Pending = {
          device: action.device,
          attached: action.type === 'attach-view',
          done: false,
          resolve,
          reject
        }
        pending.current = request
        const perform = action.type === 'attach-view' ? owner.attach : owner.shutdown
        void perform(action.device).then(
          () => {
            if (!active || pending.current !== request || !pane.isConnected) {
              reject(new Error('emulator_session_applied_unknown'))
              return
            }
            request.done = true
            setRevision((value) => value + 1)
          },
          () => {
            pending.current = null
            reject(new Error('emulator_session_not_applied'))
          }
        )
      })
    }
    pane.addEventListener('orca:emulator-frame-command', receive)
    return () => {
      active = false
      pane.removeEventListener('orca:emulator-frame-command', receive)
      pending.current?.reject(new Error('emulator_session_unmounted_effect_unknown'))
      pending.current = null
    }
  }, [paneRef])
}
