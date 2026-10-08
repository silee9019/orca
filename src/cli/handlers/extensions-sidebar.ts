import { ExtensionsSidebarParams } from '../../shared/extensions-sidebar-command'
import { rejectRemoteSelectionFlags } from '../remote-selection-flag-rejection'
import type { CommandHandler } from '../dispatch'
import { printResult } from '../format'
import { readJsonInput } from '../json-input'
import { RuntimeClientError } from '../runtime-client'

export const EXTENSIONS_SIDEBAR_HANDLERS: Record<string, CommandHandler> = {
  'extensions sidebar': async (ctx) => {
    rejectRemoteSelectionFlags(ctx.flags, 'desktop extensions sidebar')
    const parsed = ExtensionsSidebarParams.safeParse(await readJsonInput(ctx))
    if (!parsed.success) {
      throw new RuntimeClientError('invalid_argument', 'Invalid extensions sidebar request JSON')
    }
    printResult(await ctx.client.call('extensions.sidebarAction', parsed.data), ctx.json, (value) =>
      JSON.stringify(value, null, 2)
    )
  }
}
