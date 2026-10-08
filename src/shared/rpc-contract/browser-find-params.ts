import { z } from 'zod'
import { isClipboardTextByteLengthOverLimit } from '../clipboard-text'
export const FIND_QUERY_MAX_BYTES = 2 * 1024
export function isFindQueryTooLarge(query: string, maxBytes = FIND_QUERY_MAX_BYTES): boolean {
  return isClipboardTextByteLengthOverLimit(query, maxBytes)
}
export const BrowserFindAction = z.enum(['open', 'query', 'next', 'previous', 'close', 'status'])
export const BrowserFindQuery = z.string().refine((query) => !isFindQueryTooLarge(query))
export const BrowserFindState = z.object({
  open: z.boolean(),
  query: z.string(),
  activeMatch: z.number().int().nonnegative(),
  totalMatches: z.number().int().nonnegative()
})
