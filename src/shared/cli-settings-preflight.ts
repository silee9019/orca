import { z } from 'zod'

export const SettingsPreflightContext = z
  .object({
    wslDistro: z.string().trim().min(1).optional(),
    wslDefault: z.boolean().optional()
  })
  .strict()
  .refine((value) => !(value.wslDistro && value.wslDefault), 'Choose one WSL target.')
export const SettingsPreflightCheck = SettingsPreflightContext.safeExtend({
  force: z.boolean().optional()
})
const Installed = z.object({ installed: z.boolean() })
const AuthStatus = z.object({ installed: z.boolean(), authenticated: z.boolean() })
const Configured = z.object({ configured: z.boolean(), authenticated: z.boolean() })
export const SettingsPreflightOutput = z.object({
  git: Installed,
  gh: AuthStatus,
  glab: AuthStatus.optional(),
  bitbucket: Configured.optional(),
  azureDevOps: Configured.optional(),
  gitea: Configured.optional()
})
export const SettingsAgentsOutput = z.array(z.string())
export const SettingsRefreshOutput = z.object({
  agents: SettingsAgentsOutput,
  shellHydrationOk: z.boolean(),
  pathSource: z.string(),
  pathFailureReason: z.string()
})
