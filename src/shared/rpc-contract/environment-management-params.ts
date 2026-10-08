import { BrowserClientHostPlacementPreparationRequest } from '../browser-client-host-placement'
import { z } from 'zod'
export const EnvironmentSelector = z.object({ selector: z.string().min(1) }).strict()
export const EnvironmentConnect = EnvironmentSelector.extend({
  timeoutMs: z.number().int().min(1).max(120000).optional()
})
export const EnvironmentPairing = z
  .object({
    name: z.string().min(1),
    pairingCode: z.string().min(1).max(65536),
    allowLoopback: z.boolean().optional()
  })
  .strict()
export const EnvironmentRemove = EnvironmentSelector.extend({
  confirmTarget: z.string().min(1)
}).refine((value) => value.selector === value.confirmTarget, { message: 'confirm_target_mismatch' })

export const EnvironmentProbe = EnvironmentConnect.extend({
  observeOnly: z.literal(true).optional()
})

export const EnvironmentBrowserPlacement = BrowserClientHostPlacementPreparationRequest.strict()
