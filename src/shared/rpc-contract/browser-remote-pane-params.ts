import { z } from 'zod'
import {
  BrowserMarkupEditorCommand,
  BrowserMarkupEditorState
} from './browser-markup-editor-params'
import { BrowserAddressCommand, BrowserAddressState } from './browser-address-params'

export const BrowserRemotePaneInputCommand = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('click'),
    x: z.number().finite().nonnegative(),
    y: z.number().finite().nonnegative(),
    button: z.enum(['left', 'middle'])
  }),
  z.object({
    action: z.literal('key'),
    key: z.string().min(1).max(64),
    meta: z.boolean(),
    ctrl: z.boolean(),
    alt: z.boolean(),
    shift: z.boolean()
  })
])
export type BrowserRemotePaneInputCommand = z.infer<typeof BrowserRemotePaneInputCommand>
export const BrowserRemotePaneNavigationCommand = z
  .object({
    action: z.literal('navigate'),
    navigation: z.enum(['goto', 'back', 'forward', 'reload']),
    url: z.string().min(1).optional()
  })
  .refine((value) => value.navigation !== 'goto' || value.url !== undefined, {
    message: 'goto requires a URL'
  })
export type BrowserRemotePaneNavigationCommand = z.infer<typeof BrowserRemotePaneNavigationCommand>
export const BrowserRemoteFailureCommand = z.discriminatedUnion('failureAction', [
  z.object({
    action: z.literal('failure'),
    failureAction: z.enum(['copy-address', 'open-external'])
  }),
  z.object({
    action: z.literal('failure'),
    failureAction: z.literal('certificate-proceed'),
    challengeId: z.string().min(1)
  })
])
export type BrowserRemoteFailureCommand = z.infer<typeof BrowserRemoteFailureCommand>
export const BrowserRemoteFailureState = z.object({
  clipboardRequested: z.literal(true).optional(),
  externalRequested: z.literal(true).optional(),
  certificate: z
    .discriminatedUnion('ok', [
      z.object({ ok: z.literal(true) }),
      z.object({
        ok: z.literal(false),
        reason: z.enum(['expired', 'changed', 'ineligible', 'missing', 'navigated'])
      })
    ])
    .optional()
})
export type BrowserRemoteFailureState = z.infer<typeof BrowserRemoteFailureState>
export const BrowserRemotePaneCommand = z.intersection(
  z.object({
    environmentId: z.string().min(1),
    expectedRemotePageId: z.string().min(1).nullable()
  }),
  z.union([
    z.object({ action: z.enum(['reconnect', 'status']) }),
    BrowserRemotePaneInputCommand,
    BrowserRemotePaneNavigationCommand,
    z.object({ action: z.literal('address'), address: BrowserAddressCommand }),
    BrowserRemoteFailureCommand,
    z.object({ action: z.literal('markup'), markupAction: z.enum(['start', 'cancel', 'status']) }),
    z.object({ action: z.literal('markup-editor'), editor: BrowserMarkupEditorCommand })
  ])
)
export type BrowserRemotePaneCommand = z.infer<typeof BrowserRemotePaneCommand>

export const BrowserRemotePaneState = z.object({
  environmentId: z.string(),
  remotePageId: z.string().nullable(),
  streamStatus: z.enum(['idle', 'opening', 'live', 'retrying', 'stopped']),
  streamConnected: z.boolean(),
  reconnectRequested: z.boolean(),
  inputAccepted: z.boolean().optional(),
  navigationApplied: z.boolean().optional(),
  address: BrowserAddressState.optional(),
  failure: BrowserRemoteFailureState.optional(),
  markup: z
    .object({ state: z.enum(['idle', 'capturing', 'drawing', 'composing']), hasImage: z.boolean() })
    .optional(),
  markupEditor: BrowserMarkupEditorState.optional(),
  reconnectGeneration: z.number().int().nonnegative()
})
export type BrowserRemotePaneState = z.infer<typeof BrowserRemotePaneState>
