import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const EXTENSIONS_SIDEBAR_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['extensions', 'sidebar'],
    summary: 'Review, open or hide mounted Automations, Skills and Artifacts sidebar entries',
    usage: 'orca extensions sidebar --input-file <request.json> | --input-stdin [--json]',
    notes: ['Requires viewer desktop and a fresh reviewedTarget for open or hide actions.'],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  }
]
