// Why: 6px matches the usual edge-hover strip; narrower is hard to hit, wider steals clicks from content.
export const FLOATING_SIDEBAR_EDGE_HOT_ZONE_PX = 6
// Why: ~300ms forgives a diagonal pointer path leaving the panel without making it linger.
export const FLOATING_SIDEBAR_CLOSE_DELAY_MS = 300
// Why: held-state (focus, drag, open menu) has no DOM event for every case, so it is sampled.
export const FLOATING_SIDEBAR_HOLD_POLL_MS = 150

export type FloatingSidebarRevealState = {
  revealed: boolean
  pointerInside: boolean
  held: boolean
}

export type FloatingSidebarRevealEvent =
  | { type: 'pointer-enter' }
  | { type: 'pointer-leave' }
  | { type: 'hold-changed'; held: boolean }
  | { type: 'timer-elapsed' }
  | { type: 'toggle' }

export type FloatingSidebarRevealStep = {
  state: FloatingSidebarRevealState
  timer: 'start' | 'cancel' | undefined
}

export const INITIAL_FLOATING_SIDEBAR_REVEAL: FloatingSidebarRevealState = {
  revealed: false,
  pointerInside: false,
  held: false
}

export function stepFloatingSidebarReveal(
  state: FloatingSidebarRevealState,
  event: FloatingSidebarRevealEvent
): FloatingSidebarRevealStep {
  switch (event.type) {
    case 'pointer-enter':
      return { state: { ...state, revealed: true, pointerInside: true }, timer: 'cancel' }
    case 'pointer-leave':
      return {
        state: { ...state, pointerInside: false },
        timer: state.revealed && !state.held ? 'start' : undefined
      }
    case 'hold-changed':
      return {
        state: { ...state, held: event.held },
        timer: event.held ? 'cancel' : state.revealed && !state.pointerInside ? 'start' : undefined
      }
    case 'timer-elapsed':
      return {
        state:
          state.revealed && !state.pointerInside && !state.held
            ? { ...state, revealed: false }
            : state,
        timer: undefined
      }
    case 'toggle':
      return { state: { ...state, revealed: !state.revealed }, timer: 'cancel' }
  }
}
