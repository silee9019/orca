import { z } from 'zod'

export const SshCredentialObservationSchema = z
  .object({
    requests: z.array(
      z
        .object({
          requestId: z.string(),
          targetId: z.string(),
          kind: z.enum(['passphrase', 'password', 'keyboard-interactive']),
          echo: z.boolean().optional()
        })
        .strip()
    )
  })
  .strip()
export type SshCredentialObservation = z.infer<typeof SshCredentialObservationSchema>
