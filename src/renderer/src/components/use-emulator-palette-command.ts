import { useEffect, useRef } from 'react'
import { EmulatorPaletteCommandEvent } from '../runtime/emulator-palette-command'
import type {
  SimulatorTabPaletteActivationTarget,
  SimulatorTabPaletteActivationResult
} from '../lib/simulator-tab-palette-activation'
export function useEmulatorPaletteCommand(
  select: (target: SimulatorTabPaletteActivationTarget) => SimulatorTabPaletteActivationResult
): void {
  const latest = useRef(select)
  useEffect(() => {
    latest.current = select
  }, [select])
  useEffect(() => {
    const listener = (event: Event) => {
      if (event instanceof EmulatorPaletteCommandEvent && !event.result) {
        event.result = latest.current(event.selectionTarget)
      }
    }
    window.addEventListener('orca:emulator-palette-select', listener)
    return () => window.removeEventListener('orca:emulator-palette-select', listener)
  }, [])
}
