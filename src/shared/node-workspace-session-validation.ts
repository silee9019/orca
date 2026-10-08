import { isDeepStrictEqual } from 'node:util'
import { safeParseWorkspaceSession } from './workspace-session-schema'
import type { WorkspaceSessionState } from './workspace-session-state-types'

export function requireLosslessWorkspaceSession(value: unknown): WorkspaceSessionState {
  const parsed = safeParseWorkspaceSession(value)
  if (!parsed?.success || !isDeepStrictEqual(parsed.data, value)) {
    throw Object.assign(
      new Error('Session input requires repair, drops fields or has invalid values.'),
      { code: 'invalid_argument' }
    )
  }
  return parsed.data
}
