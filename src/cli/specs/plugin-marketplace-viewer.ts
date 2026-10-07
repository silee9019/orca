import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const PLUGIN_MARKETPLACE_VIEWER_SPECS: CommandSpec[] = [
  {
    path: ['plugins', 'marketplace', 'viewer'],
    summary: 'Read or filter the mounted host marketplace catalog',
    usage:
      'orca plugins marketplace viewer --viewer host --action status|search|filter|sources-open|sources-close [--value <value>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'action', 'value'],
    notes: [
      'Requires an already mounted marketplace catalog in the local host viewer. Search takes a value, including an empty value to clear it. Filter takes all or installed.',
      'Uses the existing catalog state and installed-content callback. Results contain only counts, booleans and the selected tab; search text and plugin metadata are not returned. Search and filter refuse changes while a catalog dialog is open. Active remote runtime selection refuses all viewer actions. No plugins are installed or enabled. sources-open uses the existing catalog setter. sources-close reuses the existing source dialog close owner and refuses it while a source operation is busy.'
    ]
  }
]
