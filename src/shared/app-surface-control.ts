import { z } from 'zod'
import { AI_VAULT_AGENTS } from './ai-vault-types'

export const AppSurfaceAction = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('pet-overlay'),
      action: z.enum(['status', 'position']),
      x: z.number().finite().min(-100000).max(100000).optional(),
      y: z.number().finite().min(-100000).max(100000).optional()
    })
    .strict(),
  z
    .object({
      kind: z.literal('feedback-draft'),
      action: z.enum(['status', 'remove-image', 'focus']),
      imageId: z.string().min(1).max(512).optional()
    })
    .strict(),
  z
    .object({
      kind: z.literal('update-error'),
      action: z.enum(['status', 'details', 'primary', 'secondary', 'tertiary', 'close']),
      open: z.boolean().optional()
    })
    .strict(),
  z
    .object({
      kind: z.literal('notification-step'),
      action: z.enum(['status', 'sound', 'test']),
      sound: z.string().min(1).max(128).optional()
    })
    .strict(),
  z
    .object({ kind: z.literal('theme-step'), action: z.enum(['status', 'import-ghostty']) })
    .strict(),
  z
    .object({
      kind: z.literal('shell'),
      action: z.enum([
        'status',
        'sidebar',
        'right-sidebar',
        'menu',
        'minimize',
        'maximize',
        'close',
        'expand',
        'floating',
        'update-card',
        'remote-updates',
        'onboarding',
        'feedback'
      ]),
      open: z.boolean().optional(),
      tabId: z.string().min(1).max(512).optional()
    })
    .strict(),
  z
    .object({
      kind: z.literal('onboarding'),
      action: z.enum([
        'status',
        'next',
        'back',
        'jump',
        'agent',
        'theme',
        'request-skip',
        'cancel-skip',
        'confirm-skip'
      ]),
      step: z.number().int().min(0).max(5).optional(),
      agent: z.string().min(1).max(80).optional(),
      theme: z.enum(['system', 'dark', 'light']).optional()
    })
    .strict(),
  z
    .object({
      kind: z.literal('vault'),
      action: z.enum([
        'status',
        'query',
        'refresh',
        'retry',
        'load-more',
        'enable-search',
        'search-enabled',
        'scope',
        'host',
        'group',
        'agent',
        'all-agents',
        'hide-empty',
        'limit',
        'reset',
        'resume',
        'new-chat',
        'delete',
        'copy-id',
        'copy-path',
        'copy-resume',
        'open-log',
        'reveal-log',
        'open-cwd',
        'original-pane'
      ]),
      query: z.string().max(4096).optional(),
      scope: z.enum(['workspace', 'project', 'all']).optional(),
      host: z.string().min(1).max(512).optional(),
      group: z.enum(['project', 'folder', 'agent']).optional(),
      agent: z.enum(AI_VAULT_AGENTS).optional(),
      enabled: z.boolean().optional(),
      limit: z
        .union([z.number().int().positive().max(100000).multipleOf(250), z.literal('unlimited')])
        .optional(),
      sessionId: z.string().min(1).max(512).optional(),
      confirmSessionId: z.string().min(1).max(512).optional()
    })
    .strict(),
  z
    .object({
      kind: z.literal('update-card'),
      action: z.enum(['status', 'update', 'retry-install', 'dismiss', 'collapse', 'reassurance'])
    })
    .strict()
])
export type AppSurfaceAction = z.infer<typeof AppSurfaceAction>
export const AppSurfaceControlParams = z
  .object({
    confirmTarget: z.string().min(1),
    viewer: z.number().int().positive(),
    action: AppSurfaceAction
  })
  .strict()
export const AppSurfaceRequest = z
  .object({ requestId: z.string().uuid(), action: AppSurfaceAction })
  .strict()
export type AppSurfaceRequest = z.infer<typeof AppSurfaceRequest>
export const AppSurfaceReply = z
  .object({
    requestId: z.string().uuid(),
    ok: z.boolean(),
    result: z.unknown().optional(),
    error: z.string().max(2048).optional()
  })
  .strict()
export type AppSurfaceReply = z.infer<typeof AppSurfaceReply>
export type AppSurfaceApi = {
  onRequest: (callback: (request: AppSurfaceRequest) => void) => () => void
  reply: (reply: AppSurfaceReply) => void
}

export const DesktopNativeMenuParams = z
  .object({
    confirmTarget: z.string().min(1),
    action: z.enum(['status', 'about', 'hide', 'hide-others', 'unhide', 'services'])
  })
  .strict()
