import type { HandlerGroup } from './handler-group-manifest'
export const CODEX_ACCOUNT_OBSERVE_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'codex-account-observe',
    keys: ['accounts observe-codex', 'accounts observe-codex-stream'],
    load: async () =>
      (await import('./handlers/codex-account-observe.js')).CODEX_ACCOUNT_OBSERVE_HANDLERS
  }
]
