import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_COPY_SHORTCUT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'grab', 'shortcut-copy'],
    summary:
      'Toggle the picker only when existing Cmd+C copy priority allows; native copy remains unsupported',
    usage: 'orca browser grab shortcut-copy --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  }
]
