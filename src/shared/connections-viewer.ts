import { StatusBarConnectionsViewerResult } from './status-bar-connections-viewer'
import { SshCredentialViewerResultSchema } from './ssh-credential-viewer'
import { PairingInputViewerResultSchema } from './pairing-input-viewer'
import { MobileNavigationViewerResultSchema } from './mobile-navigation-viewer'
import { RuntimeServerViewerResultSchema } from './runtime-server-viewer'
import { RuntimeLinkViewerResultSchema } from './runtime-link-viewer'
import { LocalNetworkTestViewerResultSchema } from './local-network-test-viewer'
import { NetworkProxyViewerResultSchema } from './network-proxy-viewer'
import { EmulatorSettingsViewerResultSchema } from './emulator-settings-viewer'
import { MobileDriverViewerResultSchema } from './mobile-driver-viewer'
import { SshPortsViewerResultSchema } from './ssh-ports-viewer'
import { SkillsSharedViewerResultSchema } from './skills-shared-viewer'
import { SshConfirmationViewerResultSchema } from './ssh-confirmation-viewer'
import { z } from 'zod'
import type { ConnectionsViewerCommand } from './rpc-contract/connections-viewer-params'
export type ConnectionsViewerRequest = {
  id: string
  expiresAt: number
  command: ConnectionsViewerCommand
}
export const RuntimeConnectionsViewerStateSchema = z
  .object({
    environmentId: z.string().nullable(),
    pendingSwitchValue: z.string().nullable().optional(),
    workflow: z.enum(['connect', 'share', 'cloud-vm']),
    addFormOpen: z.boolean(),
    shareFormOpen: z.boolean(),
    advancedOpen: z.boolean(),
    name: z.string(),
    pairingCodeSet: z.boolean()
  })
  .strict()
export type RuntimeConnectionsViewerState = z.infer<typeof RuntimeConnectionsViewerStateSchema>
export const MobileConnectionsViewerStateSchema = z
  .object({
    pageOpen: z.boolean().optional(),
    showMobileButton: z.boolean().optional(),
    platform: z.enum(['ios', 'android']),
    iosChannel: z.enum(['stable', 'preview']),
    connectionMode: z.enum(['automatic', 'local-only']),
    selectedAddress: z.string().nullable(),
    customAddresses: z.array(z.string()),
    stage: z.enum(['intro', 'flow', 'paired']).nullable(),
    step: z.number().int().min(0).max(1),
    pairingAvailable: z.boolean(),
    pairingLoading: z.boolean(),
    relayFailed: z.boolean(),
    deviceCount: z.number().int().nonnegative()
  })
  .strict()
export type MobileConnectionsViewerState = z.infer<typeof MobileConnectionsViewerStateSchema>
const resultFields = {
  viewerId: z.number().int().positive(),
  persisted: z.boolean().nullable(),
  applied: z.boolean(),
  reason: z.string().optional()
}
export const RuntimeConnectionsViewerResultSchema = z
  .object({ ...resultFields, state: RuntimeConnectionsViewerStateSchema })
  .strict()
export const MobileConnectionsViewerResultSchema = z
  .object({ ...resultFields, state: MobileConnectionsViewerStateSchema })
  .strict()
export const SshConnectionsViewerStateSchema = z
  .object({
    formOpen: z.boolean(),
    editingId: z.string().nullable(),
    saving: z.boolean(),
    advancedOpen: z.boolean().nullable(),
    configPickerOpen: z.boolean().optional(),
    configLoading: z.boolean().optional(),
    configError: z.boolean().optional(),
    configVisibleCount: z.number().int().nonnegative().optional(),
    configured: z
      .object({
        host: z.boolean(),
        username: z.boolean(),
        identityFile: z.boolean(),
        proxyCommand: z.boolean(),
        jumpHost: z.boolean()
      })
      .strict()
  })
  .strict()
export type SshConnectionsViewerState = z.infer<typeof SshConnectionsViewerStateSchema>
export const SshConnectionsViewerResultSchema = z
  .object({ ...resultFields, state: SshConnectionsViewerStateSchema })
  .strict()
export type SshConnectionsViewerResult = z.infer<typeof SshConnectionsViewerResultSchema>
export const EmulatorConnectionsViewerStateSchema = z
  .object({
    skillReady: z.boolean().optional(),
    skillChecking: z.boolean().optional(),
    introDismissed: z.boolean(),
    guideDismissed: z.boolean(),
    enabled: z.boolean(),
    expanded: z.boolean().nullable(),
    settingsOpen: z.boolean()
  })
  .strict()
export type EmulatorConnectionsViewerState = z.infer<typeof EmulatorConnectionsViewerStateSchema>
export const EmulatorConnectionsViewerResultSchema = z
  .object({ ...resultFields, state: EmulatorConnectionsViewerStateSchema })
  .strict()
export type EmulatorConnectionsViewerResult = z.infer<typeof EmulatorConnectionsViewerResultSchema>
export const AddressConnectionsViewerStateSchema = z
  .object({
    pickerOpen: z.boolean(),
    dialogOpen: z.boolean(),
    highlightSet: z.boolean(),
    selectionSet: z.boolean(),
    customCount: z.number().int().nonnegative(),
    draftSet: z.boolean(),
    valid: z.boolean(),
    submitting: z.boolean(),
    confirmationFailed: z.boolean()
  })
  .strict()
export type AddressConnectionsViewerState = z.infer<typeof AddressConnectionsViewerStateSchema>
export const AddressConnectionsViewerResultSchema = z
  .object({ ...resultFields, state: AddressConnectionsViewerStateSchema })
  .strict()
export type AddressConnectionsViewerResult = z.infer<typeof AddressConnectionsViewerResultSchema>
export const MobileSettingsConnectionsViewerStateSchema = z
  .object({
    connectionMode: z.enum(['automatic', 'local-only']),
    selectedAddressSet: z.boolean(),
    customCount: z.number().int().nonnegative(),
    networkCount: z.number().int().nonnegative(),
    refreshing: z.boolean(),
    loading: z.boolean(),
    pairingAvailable: z.boolean(),
    relayFailed: z.boolean(),
    qrEnlarged: z.boolean(),
    autoRestoreFitMs: z.number().nullable(),
    deviceCount: z.number().int().nonnegative()
  })
  .strict()
export type MobileSettingsConnectionsViewerState = z.infer<
  typeof MobileSettingsConnectionsViewerStateSchema
>
export const MobileSettingsConnectionsViewerResultSchema = z
  .object({ ...resultFields, state: MobileSettingsConnectionsViewerStateSchema })
  .strict()
export type MobileSettingsConnectionsViewerResult = z.infer<
  typeof MobileSettingsConnectionsViewerResultSchema
>
export const PairingSetupConnectionsViewerStateSchema = z
  .object({
    open: z.boolean(),
    pinned: z.boolean(),
    usingRelay: z.boolean()
  })
  .strict()
export type PairingSetupConnectionsViewerState = z.infer<
  typeof PairingSetupConnectionsViewerStateSchema
>
export const PairingSetupConnectionsViewerResultSchema = z
  .object({ ...resultFields, state: PairingSetupConnectionsViewerStateSchema })
  .strict()
export type PairingSetupConnectionsViewerResult = z.infer<
  typeof PairingSetupConnectionsViewerResultSchema
>
export const ConnectionsViewerResultSchema = z.union([
  StatusBarConnectionsViewerResult,
  SkillsSharedViewerResultSchema,
  PairingInputViewerResultSchema,
  SshCredentialViewerResultSchema,
  MobileNavigationViewerResultSchema,
  RuntimeServerViewerResultSchema,
  RuntimeLinkViewerResultSchema,
  LocalNetworkTestViewerResultSchema,
  NetworkProxyViewerResultSchema,
  EmulatorSettingsViewerResultSchema,
  MobileDriverViewerResultSchema,
  SshPortsViewerResultSchema,
  SshConfirmationViewerResultSchema,
  PairingSetupConnectionsViewerResultSchema,
  MobileSettingsConnectionsViewerResultSchema,
  AddressConnectionsViewerResultSchema,
  EmulatorConnectionsViewerResultSchema,
  SshConnectionsViewerResultSchema,
  RuntimeConnectionsViewerResultSchema,
  MobileConnectionsViewerResultSchema
])
export type RuntimeConnectionsViewerResult = z.infer<typeof RuntimeConnectionsViewerResultSchema>
export type MobileConnectionsViewerResult = z.infer<typeof MobileConnectionsViewerResultSchema>
export type ConnectionsViewerResult = z.infer<typeof ConnectionsViewerResultSchema>
export type ConnectionsViewerResponse = { id: string } & (
  | { ok: true; result: ConnectionsViewerResult }
  | { ok: false; error: string }
)
