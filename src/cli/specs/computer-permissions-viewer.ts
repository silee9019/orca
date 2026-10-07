import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const COMPUTER_PERMISSIONS_VIEWER_SPECS: CommandSpec[] = [
  {
    path: ['computer', 'permissions', 'viewer'],
    summary: 'Read, refresh or reset the mounted host Computer Use permissions pane',
    usage:
      'orca computer permissions viewer --viewer host --action status|refresh|reset [--confirm computer-use-permissions] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'action', 'confirm'],
    notes: [
      'Requires an already mounted Computer Use settings pane in the host desktop viewer. Uses its existing permission refresh owner and requires the exact committed generation. Remote execution selection does not redirect this local desktop permission owner. Headless, inactive, ambiguous, expired or failed owners return explicit errors. Results omit helper paths and provider errors. Reset requires --confirm computer-use-permissions and a ready macOS pane. It uses the existing local permission reset owner; provider failure or a changed owner reports an unknown effect without claiming rollback. This command does not open permission dialogs.'
    ]
  }
]
