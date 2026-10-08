import { z } from 'zod'

const accountId = z.string().min(1).max(1024)
export const CodexObservedAccountsSchema = z.object({
  accounts: z
    .array(
      z.object({
        id: accountId,
        managedHomeRuntime: z.enum(['host', 'wsl']).optional(),
        wslDistro: z.string().nullable().optional(),
        updatedAt: z.number().finite().optional(),
        lastAuthenticatedAt: z.number().finite().optional()
      })
    )
    .max(10000),
  activeAccountId: accountId.nullable(),
  activeAccountIdsByRuntime: z
    .object({ host: accountId.nullable(), wsl: z.record(z.string(), accountId.nullable()) })
    .optional(),
  systemDefault: z
    .object({ hasAuth: z.boolean(), authKind: z.enum(['oauth', 'api-key', 'none']) })
    .optional()
})
export type CodexObservation = {
  accounts: z.infer<typeof CodexObservedAccountsSchema>
  login: {
    status: 'idle' | 'pending' | 'completed' | 'cancelled' | 'failed'
    browserAuthorizationPending: boolean | null
  }
}
export type CodexObservationEvent =
  | { event: 'snapshot' | 'changed'; sequence: number; observedAt: string; state: CodexObservation }
  | { event: 'end'; sequence: number; observedAt: string; reason: 'timeout' | 'cancelled' }

function waitForCodexPoll(intervalMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const finish = (): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, intervalMs)
    signal.addEventListener('abort', finish, { once: true })
    if (signal.aborted) {
      finish()
    }
  })
}

export async function observeCodexAccountState(
  read: (timeoutMs: number, signal: AbortSignal) => Promise<CodexObservation>,
  emit: (event: CodexObservationEvent) => void,
  options: { timeoutMs: number; intervalMs: number; signal?: AbortSignal }
): Promise<void> {
  const deadline = Date.now() + options.timeoutMs
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), options.timeoutMs)
  const signal = options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal
  let previous: string | undefined
  let sequence = 0
  try {
    while (!signal.aborted) {
      let onAbort: () => void = () => {}
      const interrupted = new Promise<null>((resolve) => {
        onAbort = () => resolve(null)
        signal.addEventListener('abort', onAbort, { once: true })
      })
      let state: CodexObservation | null
      try {
        state = await Promise.race([
          read(Math.max(1, Math.min(1000, deadline - Date.now())), signal),
          interrupted
        ])
      } finally {
        signal.removeEventListener('abort', onAbort)
      }
      if (signal.aborted || state === null) {
        break
      }
      const fingerprint = JSON.stringify(state)
      if (fingerprint !== previous) {
        emit({
          event: previous === undefined ? 'snapshot' : 'changed',
          sequence: ++sequence,
          observedAt: new Date().toISOString(),
          state
        })
        previous = fingerprint
      }
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        break
      }
      await waitForCodexPoll(Math.min(options.intervalMs, remaining), signal)
    }
    emit({
      event: 'end',
      sequence: ++sequence,
      observedAt: new Date().toISOString(),
      reason: options.signal?.aborted ? 'cancelled' : 'timeout'
    })
  } finally {
    clearTimeout(timer)
  }
}
