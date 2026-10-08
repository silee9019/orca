import { z } from 'zod'

export const DaemonRestartPlanParams = z.object({}).strict()
export const DaemonRestartParams = z
  .object({
    runtimeId: z.string().min(1).max(256),
    executionHostId: z.literal('local'),
    daemonIdentityDigest: z.string().regex(/^[a-f0-9]{64}$/),
    protocolVersion: z.number().int().positive(),
    scope: z.literal('current-protocol-daemon-and-native-fallbacks'),
    confirm: z.literal(true)
  })
  .strict()

export const DaemonRestartPlan = DaemonRestartParams.omit({ confirm: true })
  .extend({
    daemon: z
      .object({ pid: z.number().int().positive(), startedAtMs: z.number().nonnegative() })
      .strict(),
    busy: z.boolean(),
    affectsAllCurrentProviderSessions: z.literal(true),
    preservesLegacyProtocolDaemons: z.literal(true)
  })
  .strict()
export const DaemonRestartReceipt = z
  .object({
    requested: DaemonRestartParams,
    restarted: z.boolean(),
    replacement: DaemonRestartPlan,
    interruptedSessionCount: z.number().int().nonnegative(),
    processExitConfirmed: z.literal(false)
  })
  .strict()
