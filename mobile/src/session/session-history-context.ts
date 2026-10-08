import { createContext, type MutableRefObject } from 'react'
import type { SessionHistory } from './session-switch-history'

/** Holds the visited-session history above the keyed session screen so a switch does not reset it. */
export const SessionHistoryContext = createContext<MutableRefObject<SessionHistory>>({
  current: []
})
