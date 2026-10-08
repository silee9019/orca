import { isDeepStrictEqual } from 'node:util'
import { safeParseWorkspaceSession } from './workspace-session-schema'
import type { WorkspaceSessionState, WorkspaceSessionPatch } from './workspace-session-state-types'

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

function isLosslessSessionPatch(
  value: unknown,
  expected: WorkspaceSessionState
): value is WorkspaceSessionPatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  try {
    requireLosslessWorkspaceSession({ ...expected, ...value })
    return true
  } catch {
    return false
  }
}
export function requireLosslessWorkspaceSessionPatch(
  value: unknown,
  expected: WorkspaceSessionState
): WorkspaceSessionPatch {
  if (!isLosslessSessionPatch(value, expected)) {
    throw Object.assign(
      new Error('Invalid session patch; values would require repair or removal.'),
      { code: 'invalid_argument' }
    )
  }
  return value
}
