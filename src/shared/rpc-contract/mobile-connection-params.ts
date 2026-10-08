import { z } from 'zod'
export const MobilePairingParams = z
  .object({
    address: z.string().min(1).optional(),
    connectionMode: z.enum(['automatic', 'local-only']),
    rotate: z.boolean().optional()
  })
  .strict()
export const RuntimePairingParams = z
  .object({
    address: z.string().min(1).optional(),
    rotate: z.boolean().optional(),
    reach: z.enum(['this-computer', 'network']).optional()
  })
  .strict()
export const MobileAddressParams = z.object({ address: z.string().min(1).optional() }).strict()
export const MobileRevokeParams = z
  .object({ deviceId: z.string().min(1), confirmTarget: z.string().min(1) })
  .strict()
  .refine((value) => value.deviceId === value.confirmTarget, { message: 'confirm_target_mismatch' })
export const MobileNetworkHumanStart = z
  .object({
    action: z.enum(['repair-firewall', 'open-network-settings']),
    address: z.string().min(1).optional()
  })
  .strict()
export const MobileNetworkHumanRequest = z.object({ requestId: z.string().uuid() }).strict()

export const MobileNetworkHumanComplete = MobileNetworkHumanRequest.extend({
  confirmTarget: z.string().uuid()
}).refine((value) => value.requestId === value.confirmTarget, {
  message: 'confirm_target_mismatch'
})
