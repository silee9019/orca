import type {
  EmulatorFrameAction,
  EmulatorFrameState
} from '../../../../shared/emulator-frame-command'

export class EmulatorFrameCommandEvent extends Event {
  completion: Promise<EmulatorFrameState> | undefined
  constructor(readonly action: EmulatorFrameAction) {
    super('orca:emulator-frame-command')
  }
}

export async function dispatchEmulatorFrameCommand(
  slot: HTMLElement,
  action: EmulatorFrameAction
): Promise<EmulatorFrameState> {
  const owner = slot.querySelector<HTMLElement>(
    action.type === 'rotate' || action.type === 'attach-view' || action.type === 'shutdown-view'
      ? '[data-emulator-pane]'
      : '[data-emulator-frame-owner]'
  )
  if (!owner) {
    throw new Error('emulator_frame_unavailable')
  }
  const event = new EmulatorFrameCommandEvent(action)
  owner.dispatchEvent(event)
  if (!event.completion) {
    throw new Error('emulator_frame_unavailable')
  }
  return event.completion
}
