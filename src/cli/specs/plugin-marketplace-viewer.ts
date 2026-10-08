import { GLOBAL_FLAGS, type CommandSpec } from '../args'
export const PLUGIN_MARKETPLACE_VIEWER_SPECS: CommandSpec[] = [
  {
    path: ['plugins', 'marketplace', 'viewer'],
    summary: 'Read or control the mounted host marketplace catalog',
    usage:
      'orca plugins marketplace viewer --viewer host --action status|search|filter|sources-open|sources-close|reload|refresh|preview|preview-close|install-preview [--source <id> --plugin <key>] [--value <value>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'viewer',
      'action',
      'value',
      'source',
      'plugin',
      'confirm',
      'content-hash',
      'consent-fingerprint',
      'marketplace-commit',
      'resolved-commit'
    ],
    notes: [
      'Requires an already mounted marketplace catalog in the local host viewer. Search takes a value, including an empty value to clear it. Filter takes all or installed.',
      'Uses the existing catalog state and installed-content callback. Results contain counts, booleans, the selected tab and an optional review identity with hashes/commits and capability/worker indicators. Search text, source URLs and manifest content are not returned. Search and filter refuse changes while a catalog dialog is open. Active remote runtime selection refuses all viewer actions. install-preview requires --confirm matching --plugin and the exact --content-hash, --consent-fingerprint, --marketplace-commit and --resolved-commit from the open review. It reuses the existing installer and requires committed installed metadata plus the parent consent screen when needed. Installation does not approve consent or enable a plugin. An interrupted or failed read-back reports an unknown effect; installation may already have completed. preview requires an exact visible source/plugin target and follows the existing install/update review route. preview-close requires the same exact target and refuses an install in progress. sources-open uses the existing catalog setter. sources-close reuses the existing source dialog close owner and refuses it while a source operation is busy. refresh reuses the existing marketplace source fetch and parent installed-list refresh owners, then requires their exact accepted generation and committed read-back. A failed or superseded parent scan returns an unknown effect. reload uses the existing catalog loader and acknowledges only its own successful generation; an overlapping retry or failed load returns an explicit unknown effect.'
    ]
  }
]
