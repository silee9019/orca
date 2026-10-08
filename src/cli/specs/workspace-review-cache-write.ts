import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const WORKSPACE_REVIEW_CACHE_WRITE_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'workspace-cache', 'set-github'],
    summary: 'Replace the addressed profile’s in-memory GitHub cache after an exact comparison',
    usage: 'orca agent workspace-cache set-github --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    destructive: true,
    notes: [
      'Requires confirm:true, expected and next complete {pr,issue} cache snapshots. Compare against an explicit github cache read; changed cache data is rejected. JSON is strictly validated, including nested PR stack, merge settings and Enterprise repository identities.',
      'Uses the existing memory-only Store setter. Receipt is appliedInMemory:true,durable:false; it does not flush, modify GitHub, validate provider truth, notify a rendered viewer or prove restart persistence. Existing sidecar snapshots at later flush are best-effort.',
      'Private cache contents belong in the request file or stdin and are omitted from the success receipt. Output from an explicit cache read still contains private cached titles, descriptions and paths.'
    ]
  }
]
