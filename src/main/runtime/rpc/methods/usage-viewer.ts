import { defineMethod } from '../core'
import { requestAccountViewerAction } from '../../account-viewer-request'
import { z } from 'zod'
import {
  UsageSignInReceiptSchema,
  UsageProvider,
  UsageQueryParams,
  UsageViewerParams
} from '../../../../shared/rpc-contract/usage-params'

export const USAGE_VIEWER_METHODS = [
  defineMethod({
    name: 'usage.viewerAction',
    params: UsageViewerParams,
    handler: async ({ action }, { signal }) => {
      const result = await requestAccountViewerAction({ domain: 'usage', action }, signal)
      switch (action.action) {
        case 'refresh-account-usage':
          return z
            .object({ provider: z.literal(action.provider), refreshCompleted: z.literal(true) })
            .strict()
            .parse(result)
        case 'roster-signin':
          return z
            .object({ provider: z.literal(action.provider), navigationRequested: z.literal(true) })
            .strict()
            .parse(result)
        case 'inline-signin':
        case 'inline-signin-status':
        case 'inline-signin-cancel':
          return UsageSignInReceiptSchema.omit({ provider: true })
            .refine(
              (value) => !('operationId' in action) || value.operationId === action.operationId,
              'Sign-in receipt mismatch'
            )
            .parse(result)
        case 'feature-wall-signin':
        case 'feature-wall-signin-status':
        case 'feature-wall-signin-cancel':
          return UsageSignInReceiptSchema.refine(
            (value) =>
              value.provider === action.provider &&
              (!('operationId' in action) || value.operationId === action.operationId),
            'Sign-in receipt mismatch'
          ).parse(result)
        case 'refresh-account-state':
          return z
            .object({ callbackCompleted: z.literal(true) })
            .strict()
            .parse(result)
        case 'open-percentage-settings':
          return z
            .object({
              pane: z.literal('appearance'),
              sectionId: z.string().min(1),
              noticeDismissed: z.literal(true)
            })
            .strict()
            .parse(result)
        case 'refresh-provider':
          if (action.provider === 'overview') {
            return z
              .object({ provider: z.literal('overview'), providers: z.array(UsageProvider) })
              .strict()
              .parse(result)
          }
          return z
            .object({
              provider: z.literal(action.provider),
              scanState: z
                .object({
                  enabled: z.boolean(),
                  isScanning: z.boolean(),
                  lastScanCompletedAt: z.number().nullable(),
                  lastScanError: z.string().nullable()
                })
                .passthrough()
            })
            .strict()
            .parse(result)
        case 'set-enabled':
          return z
            .object({
              provider: z.literal(action.provider),
              scanState: z
                .object({
                  enabled: z.literal(action.enabled),
                  isScanning: z.boolean(),
                  lastScanCompletedAt: z.number().nullable(),
                  lastScanError: z.string().nullable()
                })
                .passthrough()
            })
            .strict()
            .parse(result)
        case 'record-interaction':
          return z
            .object({
              featureId: z.literal('usage-tracking'),
              interaction: z
                .object({
                  firstInteractedAt: z.number(),
                  interactionCount: z.number().int().positive()
                })
                .passthrough()
            })
            .strict()
            .parse(result)
        case 'skill-example': {
          const common = {
            skillCommand: z.literal(action.skillCommand),
            exampleId: z.literal(action.exampleId),
            operation: z.literal(action.operation)
          }
          return action.operation === 'copy'
            ? z
                .object({ ...common, copied: z.literal(true) })
                .strict()
                .parse(result)
            : z
                .object({ ...common, open: z.literal(action.operation === 'open') })
                .strict()
                .parse(result)
        }
        case 'set-context-open':
          return z
            .object({
              target: z
                .object({ kind: z.literal(action.target.kind), id: z.literal(action.target.id) })
                .strict(),
              open: z.literal(action.open)
            })
            .strict()
            .parse(result)
        case 'dismiss-notice':
          return z
            .object({
              notice: z.literal(action.notice),
              dismissed: z.literal(true),
              applied: z.literal('viewer')
            })
            .strict()
            .parse(result)
        case 'set-menu-open':
          return z
            .object({ open: z.literal(action.open) })
            .strict()
            .parse(result)
        case 'share':
          return z
            .object({
              provider: z.literal(action.provider),
              shared: z.literal(action.operation)
            })
            .strict()
            .parse(result)
        case 'select-tab':
          return z
            .object({ tab: z.literal(action.tab) })
            .strict()
            .parse(result)
        case 'set-filters':
          return UsageQueryParams.refine(
            (value) =>
              value.provider === action.provider &&
              (action.scope === undefined || value.scope === action.scope) &&
              (action.range === undefined || value.range === action.range),
            'Usage filters were not applied'
          ).parse(result)
        case 'set-display-mode':
          return z
            .object({ mode: z.literal(action.mode), applied: z.literal('viewer') })
            .strict()
            .parse(result)
      }
    }
  })
]
