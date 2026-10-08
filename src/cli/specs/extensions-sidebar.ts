import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const EXTENSIONS_SIDEBAR_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['extensions', 'sidebar'],
    summary: 'Review, open, show or hide Automations, Skills and Artifacts sidebar entries',
    usage: 'orca extensions sidebar --input-file <request.json> | --input-stdin [--json]',
    notes: [
      'Requires viewer desktop and a fresh reviewedTarget for every action except get.',
      'open and hide need a visible entry; show restores a hidden entry; open-page opens the page like the Settings pane buttons even when its entry is hidden.'
    ],
    allowedFlags: [...GLOBAL_FLAGS, 'input-file', 'input-stdin']
  }
]
