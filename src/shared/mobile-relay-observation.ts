import { z } from 'zod'
import { MOBILE_RELAY_STATUSES } from './mobile-relay-status'
export const MobileRelayObservationSchema = z
  .object({ status: z.enum(MOBILE_RELAY_STATUSES) })
  .strip()
export type MobileRelayObservation = z.infer<typeof MobileRelayObservationSchema>
