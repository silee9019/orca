import { withTimeout } from '../../../shared/promise-timeout-fallback'
import type { PersistedUIState } from '../../../shared/persisted-ui-state-types'

// Why: store setters write ui.set without an acknowledgement, so poll the host until it shows the value.
export async function pollPersistedUi(args: {
  matches: (ui: PersistedUIState) => boolean
  keepWaiting: () => boolean
  deadline: number
}): Promise<{ ui: PersistedUIState | null; read: boolean }> {
  let ui: PersistedUIState | null = null
  let read = false
  while (args.keepWaiting() && Date.now() < args.deadline) {
    ui = await withTimeout<PersistedUIState | null>(
      window.api.ui.get(),
      Math.max(0, args.deadline - Date.now()),
      null
    )
    read = ui !== null
    if (ui !== null && args.matches(ui)) {
      break
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 25))
  }
  return { ui, read }
}
