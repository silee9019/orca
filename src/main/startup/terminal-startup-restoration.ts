import type { OrcaRuntimeService } from '../runtime/orca-runtime'
import { mainProcessState as state } from './main-process-state'

export async function prepareTerminalStartupRestoration(
  runtime: OrcaRuntimeService | null
): Promise<void> {
  if (!runtime || state.runtime !== runtime) {
    throw new Error('terminal_startup_restoration_owner_unavailable')
  }
  await Promise.all([state.firstWindowStartupServicesReady, state.managedWslCliStartupBarrierReady])
  if (state.runtime !== runtime) {
    throw new Error('terminal_startup_restoration_owner_unavailable')
  }
  await runtime.prepareStructuredAgentSessionStartupRestoration()
}
