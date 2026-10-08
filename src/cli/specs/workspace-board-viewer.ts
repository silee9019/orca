import { GLOBAL_FLAGS, type CommandSpec } from '../args'
import {
  WORKSPACE_STATUS_COLOR_IDS,
  WORKSPACE_STATUS_ICON_IDS
} from '../../shared/workspace-statuses'

const STATUS_NOTE =
  'Needs the workspace board open. Persisted confirms the host preference holds the status list the board shows. Write outcome stays unknown because the existing board action does not report its write. Add and move are not idempotent: after a timeout read the board with get before repeating.'

export const WORKSPACE_BOARD_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['ui', 'workspace-board', 'get'],
    aliases: [['ui', 'workspace-board', 'show']],
    summary: 'Read the workspace board status columns and whether the board is open',
    usage: 'orca ui workspace-board get --viewer host [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer'],
    notes: ['Status ids come from this output. Rendered is null while the board is closed.']
  },
  {
    path: ['ui', 'workspace-board', 'status-add'],
    summary: 'Add a status column through the board settings menu action',
    usage: 'orca ui workspace-board status-add --viewer host [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer'],
    notes: [
      'The board names the new column "Status N" and derives its id; read the returned statuses to find it, then rename it.',
      STATUS_NOTE
    ]
  },
  {
    path: ['ui', 'workspace-board', 'status-rename'],
    summary: 'Rename a status column',
    usage:
      'orca ui workspace-board status-rename --viewer host --status <id> --label <text> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'status', 'label'],
    notes: ['The board trims the label and keeps at most 32 characters.', STATUS_NOTE]
  },
  {
    path: ['ui', 'workspace-board', 'status-color'],
    summary: 'Change the color of a status column',
    usage:
      'orca ui workspace-board status-color --viewer host --status <id> --color <color> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'status', 'color'],
    notes: [`Colors: ${WORKSPACE_STATUS_COLOR_IDS.join(', ')}.`, STATUS_NOTE]
  },
  {
    path: ['ui', 'workspace-board', 'status-icon'],
    summary: 'Change the icon of a status column',
    usage: 'orca ui workspace-board status-icon --viewer host --status <id> --icon <icon> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'status', 'icon'],
    notes: [`Icons: ${WORKSPACE_STATUS_ICON_IDS.join(', ')}.`, STATUS_NOTE]
  },
  {
    path: ['ui', 'workspace-board', 'status-move'],
    summary: 'Move a status column one place left or right',
    usage:
      'orca ui workspace-board status-move --viewer host --status <id> --direction <left|right> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'status', 'direction'],
    notes: [
      'A column already at that end is refused, as the board disables that button.',
      STATUS_NOTE
    ]
  },
  {
    path: ['ui', 'workspace-board', 'status-remove'],
    summary: 'Remove a status column and move its workspaces to a neighboring column',
    usage: 'orca ui workspace-board status-remove --viewer host --status <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'status'],
    notes: [
      'The last remaining status cannot be removed. The workspaces move through the existing per-host metadata update; its outcome is reported as reassignment: unknown.',
      STATUS_NOTE
    ]
  },
  {
    path: ['ui', 'workspace-board', 'column-width'],
    summary: 'Set the board column width in pixels',
    usage: 'orca ui workspace-board column-width --viewer host --width <220-520> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'width'],
    notes: [
      'Needs the workspace board open. Persisted confirms the host preference holds the width the board uses.'
    ]
  }
]
