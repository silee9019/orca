export const SESSION_HISTORY_LIMIT = 10

export type SessionTarget = { worktreeId: string; name: string }

/** Sessions left by a dropdown switch, oldest first, without repeats and at most the limit. */
export type SessionHistory = SessionTarget[]

/** Records leaving `current` for `target`: a repeat moves to the end and the oldest falls off. */
export function historyAfterSwitch(
  history: SessionHistory,
  current: SessionTarget,
  target: SessionTarget
): SessionHistory {
  const kept = history.filter(
    (entry) => entry.worktreeId !== current.worktreeId && entry.worktreeId !== target.worktreeId
  )
  return [...kept, current].slice(-SESSION_HISTORY_LIMIT)
}

/** The session Back returns to, or null when the history is empty (then Back leaves the screen). */
export function historyBack(history: SessionHistory): {
  target: SessionTarget
  history: SessionHistory
} | null {
  const target = history.at(-1)
  return target ? { target, history: history.slice(0, -1) } : null
}
