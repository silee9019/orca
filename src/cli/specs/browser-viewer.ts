import { BROWSER_COPY_SHORTCUT_COMMAND_SPECS } from './browser-copy-shortcut'
import { BROWSER_NEW_TAB_COMMAND_SPECS } from './browser-new-tab'
import { BROWSER_RELOAD_MENU_COMMAND_SPECS } from './browser-reload-menu'
import { BROWSER_ANNOTATION_TRAY_COMMAND_SPECS } from './browser-annotation-tray'
import { BROWSER_ANNOTATION_ROW_COMMAND_SPECS } from './browser-annotation-row'
import { BROWSER_CONTEXT_MENU_COMMAND_SPECS } from './browser-context-menu'
import { BROWSER_PROFILE_UI_COMMAND_SPECS } from './browser-profile-ui'
import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const BROWSER_VIEWER_COMMAND_SPECS: CommandSpec[] = [
  ...BROWSER_COPY_SHORTCUT_COMMAND_SPECS,
  ...BROWSER_NEW_TAB_COMMAND_SPECS,
  ...BROWSER_RELOAD_MENU_COMMAND_SPECS,
  ...BROWSER_ANNOTATION_TRAY_COMMAND_SPECS,
  ...BROWSER_ANNOTATION_ROW_COMMAND_SPECS,
  ...BROWSER_PROFILE_UI_COMMAND_SPECS,
  ...BROWSER_CONTEXT_MENU_COMMAND_SPECS,
  {
    path: ['browser', 'markup', 'copy'],
    summary: 'Compose markup and copy the image with a native write acknowledgment',
    usage: 'orca browser markup copy --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'markup', 'text-commit'],
    summary: 'Commit text at the existing pending markup placement',
    usage: 'orca browser markup text-commit --viewer host --page <id> --text <text> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'text']
  },
  {
    path: ['browser', 'markup', 'text-cancel'],
    summary: 'Cancel the existing pending markup text placement',
    usage: 'orca browser markup text-cancel --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'address'],
    summary: 'Edit the host viewer address bar; submit/select report navigation requested only',
    usage:
      'orca browser address --viewer host --page <id> --action <open|focus|blur|draft|highlight|preview|next|previous|select|dismiss|submit|status> [--text <draft>] [--index <suggestion-index>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'action', 'text', 'index']
  },
  {
    path: ['browser', 'markup', 'tool'],
    summary: 'Use the existing markup editor tool control in the host viewer',
    usage: 'orca browser markup tool --viewer host --page <id> --tool <value> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'tool']
  },
  {
    path: ['browser', 'markup', 'color'],
    summary: 'Use the existing markup editor color control in the host viewer',
    usage: 'orca browser markup color --viewer host --page <id> --color <value> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'color']
  },
  {
    path: ['browser', 'markup', 'width'],
    summary: 'Use the existing markup editor width control in the host viewer',
    usage: 'orca browser markup width --viewer host --page <id> --width <value> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'width']
  },
  {
    path: ['browser', 'markup', 'font-size'],
    summary: 'Use the existing markup editor font-size control in the host viewer',
    usage: 'orca browser markup font-size --viewer host --page <id> --font-size <value> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'font-size']
  },
  {
    path: ['browser', 'markup', 'undo'],
    summary: 'Use the existing markup editor undo control in the host viewer',
    usage: 'orca browser markup undo --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'markup', 'redo'],
    summary: 'Use the existing markup editor redo control in the host viewer',
    usage: 'orca browser markup redo --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'markup', 'clear'],
    summary: 'Use the existing markup editor clear control in the host viewer',
    usage: 'orca browser markup clear --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'markup', 'editor-status'],
    summary: 'Use the existing markup editor editor-status control in the host viewer',
    usage: 'orca browser markup editor-status --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },

  {
    path: ['browser', 'markup', 'start'],
    summary: 'start the existing screenshot markup mode in the host viewer',
    usage: 'orca browser markup start --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'markup', 'cancel'],
    summary: 'cancel the existing screenshot markup mode in the host viewer',
    usage: 'orca browser markup cancel --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'markup', 'status'],
    summary: 'status the existing screenshot markup mode in the host viewer',
    usage: 'orca browser markup status --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },

  {
    path: ['browser', 'grab', 'toggle'],
    summary: 'Use the original grab intent toggle in the native host viewer',
    usage: 'orca browser grab toggle --viewer host --page <id> --intent <copy|annotate> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'intent']
  },
  {
    path: ['browser', 'grab', 'start'],
    summary: 'start the existing element picker in the host viewer',
    usage: 'orca browser grab start --viewer host --page <id> --intent <copy|annotate> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'intent']
  },
  {
    path: ['browser', 'grab', 'cancel'],
    summary: 'cancel the existing element picker in the host viewer',
    usage: 'orca browser grab cancel --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'grab', 'rearm'],
    summary: 'rearm the existing element picker in the host viewer',
    usage: 'orca browser grab rearm --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'grab', 'exit'],
    summary: 'exit the existing element picker in the host viewer',
    usage: 'orca browser grab exit --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'grab', 'copy'],
    summary: 'Copy the selected element contents using the host viewer clipboard owner',
    usage: 'orca browser grab copy --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'grab', 'copy-screenshot'],
    summary: 'Copy the selected element screenshot with a native write acknowledgment',
    usage: 'orca browser grab copy-screenshot --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'grab', 'status'],
    summary: 'status the existing element picker in the host viewer',
    usage: 'orca browser grab status --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'toolbar-nav'],
    summary: 'Use the host viewer toolbar history or state-aware reload action',
    usage:
      'orca browser toolbar-nav --viewer host --page <id> --action <back|forward|reload-button|reload|hard-reload> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'action']
  },
  {
    path: ['browser', 'find-ui', 'open'],
    summary: 'open the find bar in the host viewer',
    usage: 'orca browser find-ui open --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'find-ui', 'next'],
    summary: 'next the find bar in the host viewer',
    usage: 'orca browser find-ui next --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'find-ui', 'previous'],
    summary: 'previous the find bar in the host viewer',
    usage: 'orca browser find-ui previous --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'find-ui', 'close'],
    summary: 'close the find bar in the host viewer',
    usage: 'orca browser find-ui close --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'find-ui', 'status'],
    summary: 'status the find bar in the host viewer',
    usage: 'orca browser find-ui status --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'find-ui', 'query'],
    summary: 'Set the query in the host viewer find bar; match counts arrive asynchronously',
    usage: 'orca browser find-ui query --viewer host --page <id> --query <text> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'query']
  },
  {
    path: ['browser', 'zoom'],
    summary: 'Zoom an active browser page in the host viewer',
    usage: 'orca browser zoom --viewer host --page <id> --direction <in|out|reset> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'direction']
  },
  {
    path: ['browser', 'download', 'cancel'],
    destructive: true,
    summary: 'Cancel a download owned by the host viewer',
    usage: 'orca browser download cancel --viewer host --download <id> --confirm [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'download', 'confirm']
  },
  {
    path: ['browser', 'devtools', 'open'],
    summary: 'Open developer tools for a page owned by the host viewer',
    usage: 'orca browser devtools open --viewer host --page <id> --confirm [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'confirm']
  },
  {
    path: ['browser', 'webauthn', 'respond'],
    summary: 'Respond to a WebAuthn account request using a credential ID file',
    usage:
      'orca browser webauthn respond --viewer host --request <id> --credential-file <path> --confirm [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'request', 'credential-file', 'confirm']
  },
  {
    path: ['browser', 'webauthn', 'cancel'],
    summary: 'Cancel a WebAuthn account request owned by the host viewer',
    usage: 'orca browser webauthn cancel --viewer host --request <id> --confirm [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'request', 'confirm']
  },
  {
    path: ['browser', 'annotation', 'draft-status'],
    summary: 'Inspect whether the host viewer owns a pending annotation draft',
    usage: 'orca browser annotation draft-status --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'annotation', 'draft-cancel'],
    summary: 'Dismiss the pending annotation draft in the host viewer',
    usage: 'orca browser annotation draft-cancel --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'annotation', 'add'],
    summary: 'Save the pending annotation draft with a comment and intent',
    usage:
      'orca browser annotation add --viewer host --page <id> --comment <text> --intent <fix|change|question|approve> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'comment', 'intent']
  },
  {
    path: ['browser', 'annotation', 'list'],
    summary: 'List annotation comments in the host viewer',
    usage: 'orca browser annotation list --viewer host --page <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page']
  },
  {
    path: ['browser', 'annotation', 'update'],
    summary: 'Update an existing annotation comment and intent in the host viewer',
    usage:
      'orca browser annotation update --viewer host --page <id> --annotation <id> --comment <text> --intent <fix|change|question|approve> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'annotation', 'comment', 'intent']
  },
  {
    path: ['browser', 'annotation', 'rm'],
    destructive: true,
    summary: 'Delete an annotation in the host viewer',
    usage:
      'orca browser annotation rm --viewer host --page <id> --annotation <id> --confirm [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'annotation', 'confirm']
  },
  {
    path: ['browser', 'annotation', 'clear'],
    destructive: true,
    summary: 'Clear annotations for a browser page in the host viewer',
    usage: 'orca browser annotation clear --viewer host --page <id> --confirm [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'confirm']
  },
  {
    path: ['browser', 'history', 'list'],
    summary: 'List browser history in the host viewer',
    usage: 'orca browser history list --viewer host [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer']
  },
  {
    path: ['browser', 'history', 'clear'],
    destructive: true,
    summary: 'Clear browser history in the host viewer',
    usage: 'orca browser history clear --viewer host --confirm [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'confirm']
  },
  {
    path: ['browser', 'viewport-preset', 'set'],
    summary: 'Set a saved browser viewport preset in the host viewer',
    usage:
      'orca browser viewport-preset set --viewer host --page <id> --preset <mobile-s|mobile-m|mobile-l|tablet|laptop|laptop-l|desktop|default> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'page', 'preset']
  }
]
