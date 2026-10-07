import { z } from 'zod'

export const NOTIFICATION_SOUND_CLI_REQUEST = 'notifications:cliPlaySound'
export const NOTIFICATION_SOUND_CLI_RESULT = 'notifications:cliPlaySoundResult'
export const NotificationSoundCliRequest = z
  .object({
    requestId: z.uuid(),
    force: z.boolean().optional(),
    volume: z.number().min(0).max(100).optional()
  })
  .strict()
export const NotificationSoundCliResult = z
  .object({
    requestId: z.uuid(),
    result: z
      .object({
        played: z.boolean(),
        reason: z
          .enum([
            'missing-path',
            'invalid-path',
            'unsupported-type',
            'too-large',
            'read-failed',
            'playback-failed',
            'deduped'
          ])
          .optional()
      })
      .strict()
  })
  .strict()
