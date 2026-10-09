import { GLOBAL_FLAGS, type CommandSpec } from '../args'
import { FEATURE_TIP_IDS } from '../../shared/feature-tips'

export const FEATURE_TIP_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['ui', 'feature-tip', 'get'],
    summary: 'Read which feature tip dialog is open in the host viewer',
    usage: 'orca ui feature-tip get --viewer host [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer'],
    notes: [
      'Reads only, so applied is true even when no tip dialog is showing: read open and rendered.open to tell. tipId is null when none is open.',
      `Tip ids: ${FEATURE_TIP_IDS.join(', ')}.`
    ]
  },
  {
    path: ['ui', 'feature-tip', 'skip'],
    summary: 'Close the open feature tip dialog and record the tip as seen',
    usage: 'orca ui feature-tip skip --viewer host [--tip <id>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'tip'],
    // Why: --tip is single-valued; marking it repeatable makes a repeat reach validation instead of silently keeping the last.
    repeatableFlags: ['tip'],
    notes: [
      "Closes the dialog the way its close button does: it records the tip as seen and closes the dialog. It does not run the tip's primary action (CLI install, voice, session search).",
      'Needs a tip dialog showing; otherwise it is refused with feature_tip_unavailable. With --tip, a different open tip is refused with feature_tip_mismatch.',
      'Persisted confirms the host preference lists the tip as seen; a tip the app opened on its own was already recorded when it appeared. Write outcome stays unknown because the existing action does not report its write. If another tip dialog takes its place, open and rendered describe that one.'
    ]
  }
]
