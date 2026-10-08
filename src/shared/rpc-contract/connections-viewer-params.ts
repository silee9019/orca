import { StatusBarConnectionsViewerParams } from './status-bar-connections-viewer-params'
import { SshCredentialViewerParams } from '../ssh-credential-viewer'
import { PairingInputViewerParams } from '../pairing-input-viewer'
import { MobileNavigationViewerParams } from '../mobile-navigation-viewer'
import { RuntimeServerViewerParams } from '../runtime-server-viewer'
import { RuntimeLinkViewerParams } from '../runtime-link-viewer'
import { LocalNetworkTestViewerParams } from '../local-network-test-viewer'
import { NetworkProxyViewerParams } from '../network-proxy-viewer'
import { EmulatorSettingsViewerParams } from '../emulator-settings-viewer'
import { MobileDriverViewerParams } from '../mobile-driver-viewer'
import { SshPortsViewerParams } from '../ssh-ports-viewer'
import { SshConnectionsViewerParams } from './ssh-connections-viewer-params'
export {
  SshConnectionsViewerParams,
  SshViewerDraftUpdates,
  type SshViewerDraft,
  type SshViewerSurface
} from './ssh-connections-viewer-params'
import { MobileConnectionsViewerParams } from './mobile-connections-viewer-params'
export { MobileConnectionsViewerParams } from './mobile-connections-viewer-params'
import { SkillsSharedViewerParams } from '../skills-shared-viewer'
import {
  SshConfirmationConnectionsViewerParams,
  SshWorkspaceConnectionsViewerParams
} from './ssh-confirmation-viewer-params'
import { PairingSetupConnectionsViewerParams } from './pairing-setup-viewer-params'
import { z } from 'zod'
const viewer = { viewerId: z.number().int().positive() }
export const RuntimeConnectionsViewerParams = z.discriminatedUnion('operation', [
  z
    .object({
      ...viewer,
      operation: z.literal('runtime.profile-use'),
      environmentId: z.string().min(1).nullable(),
      confirmTarget: z.string().min(1)
    })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.literal('runtime.switch-request'),
      environmentId: z.string().min(1).nullable()
    })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.literal('runtime.switch-confirm'),
      confirmTarget: z.string().min(1)
    })
    .strict(),
  z.object({ ...viewer, operation: z.literal('runtime.switch-cancel') }).strict(),
  z.object({ ...viewer, operation: z.literal('runtime.get') }).strict(),
  z
    .object({
      ...viewer,
      operation: z.literal('runtime.use'),
      environmentId: z.string().min(1).nullable()
    })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.literal('runtime.workflow'),
      value: z.enum(['connect', 'share', 'cloud-vm'])
    })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.enum(['runtime.add-form', 'runtime.share-form', 'runtime.advanced']),
      open: z.boolean()
    })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.enum(['runtime.draft-name', 'runtime.draft-pairing']),
      value: z.string().max(65536)
    })
    .strict(),
  z.object({ ...viewer, operation: z.literal('runtime.cancel-add') }).strict()
])
export const EmulatorConnectionsViewerParams = z.discriminatedUnion('operation', [
  z
    .object({
      ...viewer,
      operation: z.enum([
        'emulator.hidden-settings',
        'emulator.intro-get',
        'emulator.intro-keep',
        'emulator.intro-hide',
        'emulator.intro-dismiss'
      ])
    })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.enum([
        'emulator.guide-recheck',
        'emulator.guide-get',
        'emulator.guide-dismiss',
        'emulator.guide-settings'
      ]),
      worktreeId: z.string().min(1)
    })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.literal('emulator.guide-expand'),
      worktreeId: z.string().min(1),
      open: z.boolean()
    })
    .strict()
])
export const AddressConnectionsViewerParams = z.discriminatedUnion('operation', [
  z
    .object({
      ...viewer,
      pickerId: z.string().min(1),
      operation: z.enum(['address.get', 'address.custom-cancel', 'address.custom-submit'])
    })
    .strict(),
  z
    .object({
      ...viewer,
      pickerId: z.string().min(1),
      operation: z.enum(['address.picker-open', 'address.custom-open']),
      open: z.boolean()
    })
    .strict(),
  z
    .object({
      ...viewer,
      pickerId: z.string().min(1),
      operation: z.enum([
        'address.highlight',
        'address.select',
        'address.remove',
        'address.custom-draft'
      ]),
      value: z.string().max(65536)
    })
    .strict()
])
export const MobileSettingsConnectionsViewerParams = z.discriminatedUnion('operation', [
  z
    .object({
      ...viewer,
      operation: z.enum([
        'mobile-settings.get',
        'mobile-settings.copy-pairing',
        'mobile-settings.generate',
        'mobile-settings.retry',
        'mobile-settings.refresh',
        'mobile-settings.copy-diagnostics'
      ])
    })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.literal('mobile-settings.mode'),
      value: z.enum(['automatic', 'local-only'])
    })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.enum([
        'mobile-settings.address',
        'mobile-settings.custom-add',
        'mobile-settings.custom-remove'
      ]),
      value: z.string().min(1).max(65536)
    })
    .strict(),
  z
    .object({ ...viewer, operation: z.literal('mobile-settings.qr-enlarge'), open: z.boolean() })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.literal('mobile-settings.auto-restore'),
      value: z.enum(['indefinite', '60s', '5m', '30m'])
    })
    .strict(),
  z
    .object({
      ...viewer,
      operation: z.literal('mobile-settings.revoke'),
      deviceId: z.string().min(1),
      confirmTarget: z.string().min(1)
    })
    .strict()
])
export const ConnectionsViewerParams = z.discriminatedUnion('operation', [
  ...StatusBarConnectionsViewerParams.options,
  SkillsSharedViewerParams,
  ...SshCredentialViewerParams.options,
  ...PairingInputViewerParams.options,
  ...MobileNavigationViewerParams.options,
  ...RuntimeServerViewerParams.options,
  ...RuntimeLinkViewerParams.options,
  ...LocalNetworkTestViewerParams.options,
  ...NetworkProxyViewerParams.options,
  ...EmulatorSettingsViewerParams.options,
  ...MobileDriverViewerParams.options,
  ...SshPortsViewerParams.options,
  ...SshConfirmationConnectionsViewerParams.options,
  ...SshWorkspaceConnectionsViewerParams.options,
  ...PairingSetupConnectionsViewerParams.options,
  ...RuntimeConnectionsViewerParams.options,
  ...MobileConnectionsViewerParams.options,
  ...SshConnectionsViewerParams.options,
  ...MobileSettingsConnectionsViewerParams.options,
  ...AddressConnectionsViewerParams.options,
  ...EmulatorConnectionsViewerParams.options
])
export type ConnectionsViewerCommand = z.infer<typeof ConnectionsViewerParams>
