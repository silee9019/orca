import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const BROWSER_TAB_DROP_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['browser', 'tab-drag', 'cancel'],
    summary: 'Cancel an existing browser tab drag and restore its original selection',
    usage:
      'orca browser tab-drag cancel --viewer host --workspace <id> --worktree <id> --group <id> --unified-tab <id> [--runtime-environment <owner>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'workspace',
      'worktree',
      'group',
      'unified-tab',
      'runtime-environment'
    ],
    notes: [
      'Requires exactly one enabled owner with the exact existing browser gesture and original activation snapshot. Calls the existing cancel callback and observes committed drag/hover cleanup, released owner resources and restored activation. Other passthrough leases may remain active. Does not begin a drag or synthesize pointer input; native gestures and focus are not verified. --runtime-environment identifies the page owner independently of the global viewer --environment.'
    ]
  },
  {
    path: ['browser', 'tab-drop'],
    summary: 'Move a browser workspace tab through the existing resolved drag-drop owner',
    usage:
      'orca browser tab-drop --viewer host --workspace <id> --worktree <id> --group <source-group> --unified-tab <id> [--runtime-environment <owning-environment>] --kind <tab|pane|split> --destination-group <id> [--destination-tab <id> --side <left|right>] [--direction <left|right|up|down>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'workspace',
      'worktree',
      'group',
      'unified-tab',
      'runtime-environment',
      'kind',
      'destination-group',
      'destination-tab',
      'side',
      'direction'
    ],
    notes: [
      'Requires exactly one live BrowserTab owner in the active workspace. Reuses the existing drop/reorder, source-selection restoration and paired host mirror. --runtime-environment identifies the execution owner; global --environment independently selects the viewer runtime. Tab destinations require --destination-tab and --side; split destinations require --direction. Receipt observes the resulting group order and original activation policy; paired movement additionally requires explicit host moved:true acknowledgment. A missing acknowledgment after optimistic local movement is reported as an unknown effect. Native pointer gestures, focus and rendered layout are not verified.'
    ]
  }
]
