import { z } from 'zod'
import { BrowserPairedNewTabTarget } from './browser-paired-new-tab-params'
import { BrowserClientPageTarget } from './browser-client-page-target'
export const BrowserTitlebarPairedActivationTarget = BrowserPairedNewTabTarget.extend({
  group: z.string().min(1),
  workspace: z.string().min(1),
  unifiedTab: z.string().min(1),
  page: z.string().min(1),
  remotePageId: z.string().min(1),
  hostTabId: z.string().min(1),
  placement: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('server') }),
    BrowserClientPageTarget.pick({
      browserHostClientId: true,
      browserHostGeneration: true,
      pageHostGeneration: true
    }).extend({ kind: z.literal('client') })
  ])
})
export type BrowserTitlebarPairedActivationTarget = z.infer<
  typeof BrowserTitlebarPairedActivationTarget
>
export const BrowserTitlebarPairedActivationState = z.object({
  target: BrowserTitlebarPairedActivationTarget,
  hostAcknowledged: z.literal(true),
  callerNavigation: z.literal(true),
  activeGroup: z.string().min(1),
  activeWorkspace: z.string().min(1),
  activeTab: z.string().min(1),
  activeType: z.literal('browser'),
  nativeWindowVerified: z.literal(false)
})
export type BrowserTitlebarPairedActivationState = z.infer<
  typeof BrowserTitlebarPairedActivationState
>
export const BrowserTitlebarPairedActivationCommand = z.object({
  viewer: z.literal('host'),
  operation: z.literal('titlebar-activate-paired'),
  target: BrowserTitlebarPairedActivationTarget
})
