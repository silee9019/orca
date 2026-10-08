import { z } from 'zod'
import { DesktopWorktreeInstanceTarget } from './workspace-lineage-params'
const Checkout = z
  .object({
    path: z.string().min(1).max(32768),
    head: z.string().max(256),
    branch: z.string().max(4096)
  })
  .strict()
export const DesktopWorktreeRemovalPreview = z
  .object({ target: DesktopWorktreeInstanceTarget })
  .strict()
export const DesktopWorktreeRemove = DesktopWorktreeRemovalPreview.extend({
  expectedCheckout: Checkout.optional(),
  approvedNestedWorktrees: z.array(Checkout).min(1).max(10000).optional(),
  force: z.boolean().optional(),
  allowUnverifiedPtyStop: z.boolean().optional(),
  skipArchive: z.boolean().optional(),
  allowFailedArchiveHook: z.boolean().optional()
})
  .strict()
  .superRefine((params, ctx) => {
    if (params.approvedNestedWorktrees && params.force !== true) {
      ctx.addIssue({
        code: 'custom',
        message: 'Nested deletion requires a separate force confirmation.'
      })
    }
    if (params.approvedNestedWorktrees && params.expectedCheckout) {
      const root = params.approvedNestedWorktrees.at(-1)
      if (
        !root ||
        root.path !== params.expectedCheckout.path ||
        root.head !== params.expectedCheckout.head ||
        root.branch !== params.expectedCheckout.branch
      ) {
        ctx.addIssue({ code: 'custom', message: 'The approved root must match expectedCheckout.' })
      }
    }
    if (params.skipArchive && params.allowFailedArchiveHook) {
      ctx.addIssue({
        code: 'custom',
        message: 'Choose either skipping an archive hook or waiving its failure.'
      })
    }
  })
