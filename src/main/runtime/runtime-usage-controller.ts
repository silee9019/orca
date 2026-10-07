import type { z } from 'zod'
import type { UsageProviderHandlerStore } from '../ipc/usage-provider-handlers'
import type { UsageProvider } from '../../shared/rpc-contract/usage-params'
import type {
  ClaudeUsageScope,
  ClaudeUsageRange,
  ClaudeUsageBreakdownKind
} from '../../shared/claude-usage-types'

export type RuntimeUsageProviders = Record<
  z.infer<typeof UsageProvider>,
  UsageProviderHandlerStore<ClaudeUsageScope, ClaudeUsageRange, ClaudeUsageBreakdownKind>
>

export class RuntimeUsageController {
  constructor(private readonly providers: RuntimeUsageProviders) {}

  getScanState(provider: keyof RuntimeUsageProviders): unknown {
    return this.providers[provider].getScanState()
  }

  setEnabled(provider: keyof RuntimeUsageProviders, enabled: boolean): unknown {
    return this.providers[provider].setEnabled(enabled)
  }

  refresh(provider: keyof RuntimeUsageProviders, force = false): unknown {
    return this.providers[provider].refresh(force)
  }

  getSnapshot(
    provider: keyof RuntimeUsageProviders,
    scope: ClaudeUsageScope,
    range: ClaudeUsageRange,
    limit?: number
  ): unknown {
    return this.providers[provider].getSnapshot(scope, range, limit)
  }

  getSummary(
    provider: keyof RuntimeUsageProviders,
    scope: ClaudeUsageScope,
    range: ClaudeUsageRange
  ): unknown {
    return this.providers[provider].getSummary(scope, range)
  }

  getDaily(
    provider: keyof RuntimeUsageProviders,
    scope: ClaudeUsageScope,
    range: ClaudeUsageRange
  ): unknown {
    return this.providers[provider].getDaily(scope, range)
  }

  getBreakdown(
    provider: keyof RuntimeUsageProviders,
    scope: ClaudeUsageScope,
    range: ClaudeUsageRange,
    kind: ClaudeUsageBreakdownKind
  ): unknown {
    return this.providers[provider].getBreakdown(scope, range, kind)
  }

  getRecentSessions(
    provider: keyof RuntimeUsageProviders,
    scope: ClaudeUsageScope,
    range: ClaudeUsageRange,
    limit?: number
  ): unknown {
    return this.providers[provider].getRecentSessions(scope, range, limit)
  }
}
