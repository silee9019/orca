import { z } from 'zod'
import { BrowserAddressCommand, BrowserAddressState } from './browser-address-params'
import { BrowserClientNavigationTarget } from './browser-client-navigation-params'
export const BrowserClientAddressTarget = BrowserClientNavigationTarget
export type BrowserClientAddressTarget = z.infer<typeof BrowserClientAddressTarget>
export const BrowserClientAddressCommand = BrowserAddressCommand.refine(
  (command) => command.action !== 'submit' && command.action !== 'select'
)
export const BrowserClientAddressViewerCommand = z.object({
  viewer: z.literal('host'),
  operation: z.literal('client-address'),
  target: BrowserClientAddressTarget,
  command: BrowserClientAddressCommand
})
export const BrowserClientAddressReceipt = z.object({
  target: BrowserClientAddressTarget,
  state: BrowserAddressState
})
