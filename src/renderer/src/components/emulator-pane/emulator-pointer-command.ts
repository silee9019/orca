import type { EmulatorFrameAction } from '../../../../shared/emulator-frame-command'

export class EmulatorPointerCommandEvent extends PointerEvent {
  accepted = false
}

export function dispatchEmulatorPointerSequence(
  screen: HTMLDivElement,
  action: Extract<EmulatorFrameAction, { type: 'pointer' }>
): void {
  const pointerId = 2147483646
  let began = false
  try {
    for (const point of action.points) {
      const event = new EmulatorPointerCommandEvent(`pointer${point.type}`, {
        clientX: point.clientX,
        clientY: point.clientY,
        pointerId,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        buttons: point.type === 'up' || point.type === 'cancel' ? 0 : 1,
        bubbles: true,
        cancelable: true
      })
      screen.dispatchEvent(event)
      if (point.type === 'down') {
        if (!event.accepted) {
          throw new Error('emulator_pointer_not_handled')
        }
        began = true
      }
      if (point.type === 'up' || point.type === 'cancel') {
        began = false
      }
    }
  } finally {
    if (began) {
      screen.dispatchEvent(new PointerEvent('pointercancel', { pointerId, bubbles: true }))
    }
  }
}
