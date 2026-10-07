import type { RateLimitService } from '../rate-limits/service'
import type { RateLimitRuntimeTarget } from '../../shared/rate-limit-types'

export type RuntimeRateLimitService = Pick<
  RateLimitService,
  | 'getState'
  | 'refresh'
  | 'refreshClaudeForTarget'
  | 'refreshCodexForTarget'
  | 'setPollingInterval'
  | 'fetchInactiveClaudeAccountsOnOpen'
  | 'fetchInactiveCodexAccountsOnOpen'
  | 'refreshGrok'
  | 'onStateChange'
>

export class RuntimeRateLimitController {
  constructor(private readonly service: RuntimeRateLimitService) {}

  get() {
    return this.service.getState()
  }
  refresh() {
    return this.service.refresh()
  }
  refreshClaudeForTarget(target: RateLimitRuntimeTarget) {
    return this.service.refreshClaudeForTarget(target)
  }
  refreshCodexForTarget(target: RateLimitRuntimeTarget) {
    return this.service.refreshCodexForTarget(target)
  }
  setPollingInterval(ms: number): void {
    this.service.setPollingInterval(ms)
  }
  fetchInactiveClaudeAccounts() {
    return this.service.fetchInactiveClaudeAccountsOnOpen()
  }
  fetchInactiveCodexAccounts() {
    return this.service.fetchInactiveCodexAccountsOnOpen()
  }
  refreshMiniMax() {
    return this.service.refresh()
  }
  refreshGrok() {
    return this.service.refreshGrok()
  }
  onUpdate(listener: Parameters<RateLimitService['onStateChange']>[0]) {
    return this.service.onStateChange(listener)
  }
}
