import { z } from 'zod'

export const AppLifecycleAction = z.enum([
  'quit',
  'restart',
  'relaunch',
  'reload',
  'install-update'
])
export const AppLifecycleRequest = z
  .object({ requestId: z.string().uuid(), action: AppLifecycleAction })
  .strict()
export type AppLifecycleAction = z.infer<typeof AppLifecycleAction>
export const AppLifecycleControlParams = z
  .object({
    confirmTarget: z.string().min(1),
    viewer: z.number().int().positive(),
    action: AppLifecycleAction
  })
  .strict()

export const AppLifecycleInstallParams = AppLifecycleControlParams.omit({ action: true })
