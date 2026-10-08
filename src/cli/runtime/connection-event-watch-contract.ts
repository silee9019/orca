import { z } from 'zod'
import {
  MobileRelayObservationSchema,
  type MobileRelayObservation
} from '../../shared/mobile-relay-observation'
import {
  SshPortObservationSchema,
  type SshPortObservation
} from '../../shared/ssh-port-observation'
import {
  SshCredentialObservationSchema,
  type SshCredentialObservation
} from '../../shared/ssh-credential-observation'
import { RuntimeClientError } from './types'

const State = z
  .object({
    status: z.enum([
      'disconnected',
      'connecting',
      'connected',
      'reconnecting',
      'auth-failed',
      'deploying-relay',
      'reconnection-failed',
      'error'
    ])
  })
  .strip()
const Row = z.object({ targetId: z.string(), state: State }).strip()
export const Ready = z
  .object({
    type: z.literal('ready'),
    subscriptionId: z.string(),
    snapshot: z
      .object({
        sshStates: z.array(Row).optional(),
        sshCredentials: SshCredentialObservationSchema.optional(),
        sshPorts: z.array(SshPortObservationSchema).optional(),
        mobileRelay: MobileRelayObservationSchema.optional()
      })
      .optional()
  })
  .strip()
export const Changed = Row.extend({ type: z.literal('sshStateChanged') }).strip()
export type SshStateObservation = { targetId: string; status: z.infer<typeof State>['status'] }
export type ConnectionWatchResult = {
  requestId: string
  runtimeId: string
  observations: SshStateObservation[]
  credentialObservations?: SshCredentialObservation[]
  portObservations?: SshPortObservation[]
  mobileRelayObservations?: MobileRelayObservation[]
  ended: 'duration' | 'limit' | 'aborted' | 'host-ended'
}

export type Row = z.infer<typeof Row>
export type ConnectionWatchOptions = {
  durationMs: number
  limit: number
  targetId?: string
  signal?: AbortSignal
  observeCredentials?: boolean
  observePorts?: 'forwards' | 'detected'
  observeMobileRelay?: boolean
}

export function validateConnectionWatchOptions(options: ConnectionWatchOptions): void {
  if (
    !Number.isInteger(options.durationMs) ||
    options.durationMs < 1 ||
    options.durationMs > 60000 ||
    !Number.isInteger(options.limit) ||
    options.limit < 1 ||
    options.limit > 1000
  ) {
    throw new RuntimeClientError(
      'invalid_argument',
      'Watch duration must be 1..60000 ms and limit 1..1000.'
    )
  }
}

export const RelayChanged = z.object({
  type: z.literal('mobileRelayChanged'),
  observation: MobileRelayObservationSchema
})
export const PortsChanged = z.object({
  type: z.literal('sshPortsChanged'),
  observation: SshPortObservationSchema
})
export const CredentialsChanged = z.object({
  type: z.literal('sshCredentialsChanged'),
  observation: SshCredentialObservationSchema
})
