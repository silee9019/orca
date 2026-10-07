import { describe, expect, it } from 'vitest'
import {
  INITIAL_FLOATING_SIDEBAR_REVEAL,
  stepFloatingSidebarReveal,
  type FloatingSidebarRevealEvent,
  type FloatingSidebarRevealState
} from './floating-sidebar-reveal'

function run(
  events: FloatingSidebarRevealEvent[],
  from: FloatingSidebarRevealState = INITIAL_FLOATING_SIDEBAR_REVEAL
): { state: FloatingSidebarRevealState; timers: (string | undefined)[] } {
  let state = from
  const timers: (string | undefined)[] = []
  for (const event of events) {
    const step = stepFloatingSidebarReveal(state, event)
    state = step.state
    timers.push(step.timer)
  }
  return { state, timers }
}

describe('stepFloatingSidebarReveal', () => {
  it('starts closed', () => {
    expect(INITIAL_FLOATING_SIDEBAR_REVEAL.revealed).toBe(false)
  })

  it('opens immediately when the pointer enters', () => {
    expect(run([{ type: 'pointer-enter' }]).state.revealed).toBe(true)
  })

  it('schedules a close on pointer leave and closes when the timer elapses', () => {
    const { state, timers } = run([
      { type: 'pointer-enter' },
      { type: 'pointer-leave' },
      { type: 'timer-elapsed' }
    ])
    expect(timers).toEqual(['cancel', 'start', undefined])
    expect(state.revealed).toBe(false)
  })

  it('cancels the pending close when the pointer re-enters', () => {
    const { state, timers } = run([
      { type: 'pointer-enter' },
      { type: 'pointer-leave' },
      { type: 'pointer-enter' },
      { type: 'timer-elapsed' }
    ])
    expect(timers[2]).toBe('cancel')
    expect(state.revealed).toBe(true)
  })

  it('stays open while held (focus, drag, menu) even after the delay', () => {
    const { state, timers } = run([
      { type: 'pointer-enter' },
      { type: 'hold-changed', held: true },
      { type: 'pointer-leave' },
      { type: 'timer-elapsed' }
    ])
    expect(timers[2]).toBeUndefined()
    expect(state.revealed).toBe(true)
  })

  it('restarts the close delay when the hold is released outside the panel', () => {
    const { state, timers } = run([
      { type: 'pointer-enter' },
      { type: 'hold-changed', held: true },
      { type: 'pointer-leave' },
      { type: 'hold-changed', held: false },
      { type: 'timer-elapsed' }
    ])
    expect(timers[3]).toBe('start')
    expect(state.revealed).toBe(false)
  })

  it('does not close on a stale timer while the pointer is inside', () => {
    const { state } = run([
      { type: 'pointer-enter' },
      { type: 'pointer-leave' },
      { type: 'pointer-enter' },
      { type: 'timer-elapsed' }
    ])
    expect(state.revealed).toBe(true)
  })

  it('toggle opens and closes without a pointer and keeps it open for keyboard use', () => {
    const open = run([{ type: 'toggle' }])
    expect(open.state.revealed).toBe(true)
    expect(open.timers).toEqual(['cancel'])
    expect(run([{ type: 'toggle' }], open.state).state.revealed).toBe(false)
  })

  it('toggle closes even while held', () => {
    const { state } = run([
      { type: 'pointer-enter' },
      { type: 'hold-changed', held: true },
      { type: 'toggle' }
    ])
    expect(state.revealed).toBe(false)
  })
})
