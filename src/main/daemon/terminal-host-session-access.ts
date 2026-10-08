import { SessionNotFoundError } from './daemon-errors'
import type { Session } from './session'

export function getAliveTerminalHostSession(
  sessions: ReadonlyMap<string, Session>,
  sessionId: string,
  expectedIncarnationId?: string
): Session {
  const session = sessions.get(sessionId)
  if (expectedIncarnationId !== undefined && session?.incarnationId !== expectedIncarnationId) {
    throw new Error('session_incarnation_changed')
  }
  if (!session || !session.isAlive) {
    throw new SessionNotFoundError(sessionId)
  }
  return session
}
