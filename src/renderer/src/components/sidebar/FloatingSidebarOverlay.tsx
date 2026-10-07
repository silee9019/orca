import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import {
  FLOATING_SIDEBAR_CLOSE_DELAY_MS,
  FLOATING_SIDEBAR_EDGE_HOT_ZONE_PX,
  FLOATING_SIDEBAR_HOLD_POLL_MS,
  INITIAL_FLOATING_SIDEBAR_REVEAL,
  stepFloatingSidebarReveal,
  type FloatingSidebarRevealEvent
} from './floating-sidebar-reveal'
import {
  hasOpenFloatingSidebarPopup,
  isFloatingSidebarHeld,
  isPanelFocusHolding
} from './floating-sidebar-hold'

export function FloatingSidebarOverlay({
  children,
  topInset = 0
}: {
  children: React.ReactNode
  topInset?: number
}): React.JSX.Element {
  const [revealed, setRevealed] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const stateRef = useRef(INITIAL_FLOATING_SIDEBAR_REVEAL)
  // Counter, not boolean: each 'start' must restart the delay even if one is already pending.
  const [closeTimerGeneration, setCloseTimerGeneration] = useState<number | null>(null)
  const pointerDownInsideRef = useRef(false)

  const dispatch = useCallback((event: FloatingSidebarRevealEvent) => {
    const step = stepFloatingSidebarReveal(stateRef.current, event)
    const revealedChanged = step.state.revealed !== stateRef.current.revealed
    stateRef.current = step.state
    if (step.timer === 'start') {
      setCloseTimerGeneration((generation) => (generation ?? 0) + 1)
    } else if (step.timer === 'cancel' || event.type === 'timer-elapsed') {
      setCloseTimerGeneration(null)
    }
    if (revealedChanged) {
      setRevealed(step.state.revealed)
    }
  }, [])

  const sampleHold = useCallback((): void => {
    const panel = panelRef.current
    const held = isFloatingSidebarHeld({
      pointerDown: pointerDownInsideRef.current,
      panelHasFocus: isPanelFocusHolding(panel, document.activeElement),
      hasOpenPopup: hasOpenFloatingSidebarPopup(document),
      hasModal: useAppStore.getState().activeModal !== 'none'
    })
    if (held !== stateRef.current.held) {
      dispatch({ type: 'hold-changed', held })
    }
  }, [dispatch])

  useEffect(() => {
    if (closeTimerGeneration === null) {
      return
    }
    const timer = setTimeout(
      () => dispatch({ type: 'timer-elapsed' }),
      FLOATING_SIDEBAR_CLOSE_DELAY_MS
    )
    return () => clearTimeout(timer)
  }, [closeTimerGeneration, dispatch])

  useEffect(() => {
    if (!revealed) {
      return
    }
    const interval = setInterval(sampleHold, FLOATING_SIDEBAR_HOLD_POLL_MS)
    return () => clearInterval(interval)
  }, [revealed, sampleHold])

  useEffect(() => {
    const release = (): void => {
      pointerDownInsideRef.current = false
    }
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    return () => {
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
    }
  }, [])

  const handleEnter = (): void => dispatch({ type: 'pointer-enter' })
  const handleLeave = (): void => {
    sampleHold()
    dispatch({ type: 'pointer-leave' })
  }

  return (
    <>
      {/* Why: stays mounted while open so a pointer that leaves straight from the strip still reports leave. */}
      <div
        data-floating-sidebar-edge=""
        className="absolute bottom-0 left-0 z-20"
        style={{ top: topInset, width: FLOATING_SIDEBAR_EDGE_HOT_ZONE_PX }}
        onPointerEnter={handleEnter}
        onPointerLeave={handleLeave}
      />
      <div
        ref={panelRef}
        data-floating-sidebar=""
        data-state={revealed ? 'open' : 'closed'}
        // Why: closed panel is hidden from focus and the a11y tree; hover never moves focus into it.
        style={{ top: topInset }}
        className={`absolute bottom-0 left-0 z-20 flex shadow-floating transition-[transform,visibility] duration-150 motion-reduce:transition-none ${
          revealed ? 'translate-x-0 visible' : '-translate-x-full invisible'
        }`}
        onPointerEnter={handleEnter}
        onPointerLeave={handleLeave}
        onPointerDownCapture={() => {
          pointerDownInsideRef.current = true
        }}
      >
        {children}
      </div>
    </>
  )
}
