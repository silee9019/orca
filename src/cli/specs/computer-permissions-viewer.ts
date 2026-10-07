import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const COMPUTER_PERMISSIONS_VIEWER_SPECS: CommandSpec[] = [
  {
    path: ['computer', 'permissions', 'viewer'],
    summary: 'Read or refresh the mounted host Computer Use permissions pane',
    usage: 'orca computer permissions viewer --viewer host --action status|refresh [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'action'],
    notes: [
      'Requires an already mounted Computer Use settings pane in the host desktop viewer. Uses its existing permission refresh owner and requires the exact committed generation. Remote execution selection does not redirect this local desktop permission owner. Headless, inactive, ambiguous, expired or failed owners return explicit errors. Results omit helper paths and provider errors. This command does not request or reset OS permissions.'
    ]
  }
]
