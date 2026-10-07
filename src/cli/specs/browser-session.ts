import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const BROWSER_SESSION_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['tab', 'profile', 'import-file'],
    summary: 'Import a cookie JSON file from an absolute path on the selected runtime host',
    usage:
      'orca tab profile import-file --profile <id> --file <host-absolute-path> --confirm [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'profile', 'file', 'confirm']
  },
  {
    path: ['tab', 'profile', 'detect-browsers'],
    summary: 'List browsers and cookie profiles on the selected runtime host',
    usage: 'orca tab profile detect-browsers [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['tab', 'profile', 'import-browser'],
    summary: 'Import cookies from a browser on the selected runtime host',
    usage:
      'orca tab profile import-browser --profile <id> --browser-family <family> [--browser-profile <name>] --confirm [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'profile', 'browser-family', 'browser-profile', 'confirm']
  },
  {
    path: ['tab', 'profile', 'clear-default-cookies'],
    destructive: true,
    summary: 'Clear default browser session cookies on the selected runtime host',
    usage: 'orca tab profile clear-default-cookies --confirm [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'confirm']
  },
  {
    path: ['browser', 'certificate', 'proceed'],
    summary: 'Approve the current certificate challenge for an explicit browser page',
    usage:
      'orca browser certificate proceed --page <id> --challenge <id> --confirm [--worktree <selector>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'page', 'challenge', 'confirm', 'worktree']
  }
]
