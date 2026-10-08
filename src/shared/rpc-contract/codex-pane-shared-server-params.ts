import { z } from 'zod'
import { TerminalHostDetailsParams } from './terminal-host-details-params'

export const CodexPaneSharedServerStatusParams = TerminalHostDetailsParams
export const CodexPaneSharedServerMutationParams = TerminalHostDetailsParams.extend({
  confirm: z.literal(true)
}).strict()
