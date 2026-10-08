import { GLOBAL_FLAGS, type CommandSpec } from '../args'

export const NATIVE_CHAT_WATCH_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['agent', 'history', 'watch'],
    summary: 'Watch the selected host’s canonical native transcript for a bounded interval',
    usage: 'orca agent history watch --request-file <path|-> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'request-file'],
    notes: [
      'Strict file/stdin JSON requires agent, sessionId and watchMs (positive integer milliseconds). transcriptPath and limit are optional. Reads the selected profile/paired execution host without local fallback; local hosts must advertise nativeChatStreaming:1.',
      'Always emits newline-delimited JSON transcript events. This explicit read includes private message bodies and tool details; keep its output private. Subscription tokens are generated per invocation. No arbitrary RPC or JavaScript evaluation is available.',
      'The watch interval starts after the first host frame. Timeout and host-end receipts do not prove transcript or agent completion. SIGINT/SIGTERM close only this subscription and exit 130/143. Connection/host errors fail explicitly; the existing startup timeout bounds opening a watch.'
    ]
  }
]
