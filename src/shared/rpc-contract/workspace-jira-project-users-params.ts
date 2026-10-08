import { z } from 'zod'
import { OptionalPlainString, OptionalString } from './rpc-param-primitives'

export const JiraProjectAssignableUsers = z.object({
  projectIdOrKey: z.string().trim().min(1),
  query: OptionalPlainString,
  siteId: OptionalString
})
