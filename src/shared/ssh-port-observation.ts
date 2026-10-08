import { z } from 'zod'
import type { DetectedPort, PortForwardEntry } from './ssh-types'

export const SshPortObservationSchema = z.discriminatedUnion('source', [
  z
    .object({
      source: z.literal('forwards'),
      targetId: z.string(),
      forwards: z.array(
        z
          .object({ id: z.string(), localPort: z.number().int(), remotePort: z.number().int() })
          .strip()
      )
    })
    .strip(),
  z
    .object({
      source: z.literal('detected'),
      targetId: z.string(),
      ports: z.array(z.number().int())
    })
    .strip()
])
export type SshPortObservation = z.infer<typeof SshPortObservationSchema>
export function projectForwardObservation(
  targetId: string,
  forwards: PortForwardEntry[]
): SshPortObservation {
  return {
    source: 'forwards',
    targetId,
    forwards: forwards.map(({ id, localPort, remotePort }) => ({ id, localPort, remotePort }))
  }
}
export function projectDetectedObservation(
  targetId: string,
  ports: DetectedPort[]
): SshPortObservation {
  return { source: 'detected', targetId, ports: ports.map(({ port }) => port) }
}
