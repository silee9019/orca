import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_READER_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['runtime', 'browser-drivers'],
    summary: 'Read every browser driver from the selected execution runtime',
    usage: 'orca runtime browser-drivers [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['runtime', 'client-browser-rows'],
    summary: 'Read all host-owned client browser rows without claiming renderer hydration delivery',
    usage: 'orca runtime client-browser-rows [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  }
]
