import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'
export const WORKSPACE_FILE_WATCH_SPECS: CommandSpec[] = [
  {
    path: ['file', 'watch-start'],
    summary: 'Start a CLI-owned workspace file watch',
    usage: 'orca file watch-start --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input: worktree selector.',
      'The selected runtime resolves Git and folder workspace paths and owns the native or SSH watcher. Unknown hosts fail without a local fallback.',
      'Only server-issued CLI UUIDs are accepted; renderer subscriptions cannot be stopped. Stop waits for the exact lease release; a failed release is retained for retry.',
      'At most eight watches and 128 events / 64 KiB per watch are retained. Poll status within 60 seconds to retain the lease. Sequence gaps and native overflow require a fresh file listing; this is not a complete history.',
      'Old peers fail explicitly.'
    ]
  },
  {
    path: ['file', 'watch-status'],
    summary: 'Status a CLI-owned workspace file watch',
    usage: 'orca file watch-status --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input: requestId from start, afterSequence (optional).',
      'The selected runtime resolves Git and folder workspace paths and owns the native or SSH watcher. Unknown hosts fail without a local fallback.',
      'Only server-issued CLI UUIDs are accepted; renderer subscriptions cannot be stopped. Stop waits for the exact lease release; a failed release is retained for retry.',
      'At most eight watches and 128 events / 64 KiB per watch are retained. Poll status within 60 seconds to retain the lease. Sequence gaps and native overflow require a fresh file listing; this is not a complete history.',
      'Old peers fail explicitly.'
    ]
  },
  {
    path: ['file', 'watch-stop'],
    summary: 'Stop a CLI-owned workspace file watch',
    usage: 'orca file watch-stop --params-file <file|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'params-file'],
    notes: [
      'Input: requestId from start.',
      'The selected runtime resolves Git and folder workspace paths and owns the native or SSH watcher. Unknown hosts fail without a local fallback.',
      'Only server-issued CLI UUIDs are accepted; renderer subscriptions cannot be stopped. Stop waits for the exact lease release; a failed release is retained for retry.',
      'At most eight watches and 128 events / 64 KiB per watch are retained. Poll status within 60 seconds to retain the lease. Sequence gaps and native overflow require a fresh file listing; this is not a complete history.',
      'Old peers fail explicitly.'
    ]
  }
]
