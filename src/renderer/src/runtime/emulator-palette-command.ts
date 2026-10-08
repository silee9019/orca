import type {
  SimulatorTabPaletteActivationTarget,
  SimulatorTabPaletteActivationResult
} from '../lib/simulator-tab-palette-activation'
export class EmulatorPaletteCommandEvent extends Event {
  result: SimulatorTabPaletteActivationResult | undefined
  constructor(readonly selectionTarget: SimulatorTabPaletteActivationTarget) {
    super('orca:emulator-palette-select')
  }
}
export function dispatchEmulatorPaletteSelect(target: SimulatorTabPaletteActivationTarget): void {
  const event = new EmulatorPaletteCommandEvent(target)
  window.dispatchEvent(event)
  if (event.result?.status !== 'activated') {
    throw new Error('emulator_palette_owner_unavailable')
  }
}
