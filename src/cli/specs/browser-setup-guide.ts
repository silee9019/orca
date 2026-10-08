import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_SETUP_GUIDE_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'setup-guide'],
    summary: 'Read or prepare Browser Use setup in the exact mounted guide owner',
    usage:
      'orca browser setup-guide --viewer host --surface modal|settings --runtime local --workspace <id|none> --action status|prepare-install|try-it [--confirm browser-use-setup] [--target-workspace <id|none> --group <id|none>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'surface',
      'runtime',
      'workspace',
      'action',
      'confirm',
      'target-workspace',
      'group'
    ],
    notes: [
      'try-it requires exact --target-workspace and --group. Use none for both only when the mounted owner has no setup target; it opens the existing Add Project modal. An existing target must have the exact current group and local-client browser creation policy; it reuses workspace activation, default profile/home URL and address focus intent. Provider/target/group mismatch is rejected before effects.',
      'Requires an already mounted Browser Use setup-guide action owner. Preparation requires --confirm browser-use-setup and reuses its existing local setup callback: enables Browser Use, disables orchestration, copies the setup command and inserts it in the existing inline terminal for review. It does not execute the command or prove installation. Replies omit command content and provider errors. Clipboard acknowledgement follows the completed write. Inactive, mismatched, ambiguous, busy, unsupported or stale owners return explicit errors.'
    ]
  }
]
