import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const PLUGIN_MARKETPLACE_VIEWER_SPECS: CommandSpec[] = [
  {
    path: ['plugins', 'marketplace', 'viewer'],
    summary: 'Read or filter the mounted host marketplace catalog',
    usage:
      'orca plugins marketplace viewer --viewer host --action status|search|filter [--value <value>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'viewer', 'action', 'value'],
    notes: [
      'Requires an already mounted marketplace catalog in the local host viewer. Search takes a value, including an empty value to clear it. Filter takes all or installed.',
      'Uses the existing catalog state and installed-content callback. Results contain only counts, booleans and the selected tab; search text and plugin metadata are not returned. Dialogs and active remote runtime selection refuse state changes. No plugins are installed or enabled.'
    ]
  }
]
