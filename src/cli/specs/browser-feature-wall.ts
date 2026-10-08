import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_FEATURE_WALL_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'feature-wall'],
    summary: 'Read or recheck the exact mounted Browser Use tour setup card',
    usage:
      'orca browser feature-wall --viewer host --runtime local --workspace <id|none> --action status|recheck|install-intent [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'runtime', 'workspace', 'action'],
    notes: [
      'Requires the already open feature-wall modal and exactly one Browser Use setup card. Targets the current local discovery owner and exact workspace, including folder workspaces. Install intent records the existing setup interaction and local preference; it does not open or execute a terminal. Unsupported remote discovery owners, onboarding surfaces, failed scans and stale generations return explicit errors.'
    ]
  }
]
