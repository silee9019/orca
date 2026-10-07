import { z } from 'zod'
import { AccountsViewerActionSchema } from '../accounts-viewer-command'

const AccountsViewerInput = z
  .object({
    viewer: z.literal('desktop'),
    action: AccountsViewerActionSchema
  })
  .strict()

export const AccountsViewerParams = z.unknown().transform((input, context) => {
  const parsed = AccountsViewerInput.safeParse(input)
  if (!parsed.success) {
    context.addIssue({ code: 'custom', message: 'Invalid account viewer parameters' })
    return z.NEVER
  }
  return parsed.data
})
