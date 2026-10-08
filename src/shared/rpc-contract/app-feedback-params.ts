import { z } from 'zod'
import { MAX_FEEDBACK_IMAGE_COUNT } from '../feedback-image-limits'

export const DesktopFeedbackSubmitParams = z
  .object({
    confirmTarget: z.string().min(1),
    feedback: z.string().trim().min(1).max(60000),
    submitAnonymously: z.boolean(),
    githubLogin: z.string().max(128).nullable().optional(),
    githubEmail: z.string().max(320).nullable().optional(),
    images: z
      .array(
        z
          .object({
            path: z.string().min(1).max(32768),
            contentType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
          })
          .strict()
      )
      .max(MAX_FEEDBACK_IMAGE_COUNT)
      .optional()
  })
  .strict()
