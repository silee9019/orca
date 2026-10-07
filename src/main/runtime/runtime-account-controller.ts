import type { ClaudeAccountService } from '../claude-accounts/service'
import { hasAppEnvironment } from '../../shared/app-environment'
import { getManagedDataAccountService } from '../managed-data-accounts/service'
import type {
  ClaudeRateLimitAccountsState,
  CodexRateLimitAccountsState,
  ManagedDataAccountProvider,
  ManagedDataAccountsState
} from '../../shared/managed-account-types'
import type {
  CodexAccountService,
  CodexResetCreditRejectedBeforeProviderReason
} from '../codex-accounts/service'
import type { CodexAccountSelectionTarget } from '../codex-accounts/runtime-selection'
import type { RateLimitService } from '../rate-limits/service'
import type { CodexRateLimitResetOutcome, RateLimitState } from '../../shared/rate-limit-types'
import type { CodexResetCreditExpectedScope } from '../../shared/codex-reset-credit-scope'
import type { CommitMessageAgentEnvironmentResolvers } from '../text-generation/commit-message-agent-environment'
import type { ClaudeAccountSelectionTarget } from '../claude-accounts/runtime-selection'
import type { AccountCredentialOperation } from '../../shared/rpc-contract/account-credentials-params'
import { manageAccountCredential } from './account-credential-operations'
import type {
  AccountLoginOperation,
  AccountLoginStatus
} from '../../shared/rpc-contract/account-login-params'
import {
  ProfileAuthControls,
  type ProfileAuthControlOptions
} from '../orca-profiles/profile-auth-controls'
import type { ProfileAuthControlOperation } from '../../shared/rpc-contract/profile-auth-params'

export type RuntimeAccountServices = {
  claudeAccounts: ClaudeAccountService
  codexAccounts: CodexAccountService
  rateLimits: RateLimitService
}

export type AccountsSnapshot = {
  opencode?: ManagedDataAccountsState
  devin?: ManagedDataAccountsState
  claude: ClaudeRateLimitAccountsState
  codex: CodexRateLimitAccountsState
  rateLimits: RateLimitState
}

export type CodexRateLimitResetRpcResult = {
  scope: CodexResetCreditExpectedScope
  snapshot: AccountsSnapshot
} & (
  | { outcome: CodexRateLimitResetOutcome }
  | {
      status: 'rejectedBeforeProvider'
      retryDisposition: 'discardAttempt'
      reason: CodexResetCreditRejectedBeforeProviderReason
    }
)

export class RuntimeAccountController {
  private services: RuntimeAccountServices | null = null
  private commitMessageAgentEnvironment: CommitMessageAgentEnvironmentResolvers | null = null
  private readonly loginStates = new Map<'claude' | 'codex', AccountLoginStatus>()
  private profileAuth: ProfileAuthControls | null = null

  setServices(services: RuntimeAccountServices): void {
    this.services = services
  }

  configureProfileAuth(options: ProfileAuthControlOptions): void {
    this.profileAuth = new ProfileAuthControls(options)
  }

  manageProfileAuth(operation: ProfileAuthControlOperation) {
    const controls = this.profileAuth
    if (!controls) {
      throw new Error('Orca profile authentication controls are not configured on this host.')
    }
    switch (operation.action) {
      case 'start':
        return controls.start()
      case 'status':
        return controls.status()
      case 'cancel':
        return controls.cancel()
      case 'sign-out':
        return controls.signOut()
      case 'refresh':
        return controls.refresh()
      case 'select-org':
        return controls.selectOrg(operation.orgId)
    }
  }

  manageLogin(operation: AccountLoginOperation): AccountLoginStatus {
    const services = this.requireServices()
    const service =
      operation.provider === 'claude' ? services.claudeAccounts : services.codexAccounts
    const state = this.loginStates.get(operation.provider) ?? { status: 'idle' }
    if (operation.action === 'status') {
      return {
        ...state,
        ...(operation.provider === 'codex'
          ? { browserAuthorizationPending: services.codexAccounts.getPendingLoginUrl() !== null }
          : {})
      }
    }
    if (operation.action === 'cancel') {
      if (service.cancelPendingLogin()) {
        state.status = 'cancelled'
        this.loginStates.set(operation.provider, state)
      }
      return { ...state }
    }
    if (state.status === 'pending') {
      throw new Error('An account login is already pending. Cancel it before starting another.')
    }
    const pending: AccountLoginStatus = { status: 'pending' }
    this.loginStates.set(operation.provider, pending)
    const promise = operation.accountId
      ? service.reauthenticateAccount(operation.accountId)
      : service.addAccount(operation.target)
    void promise.then(
      () => {
        if (pending.status === 'pending') {
          pending.status = 'completed'
        }
      },
      () => {
        if (pending.status === 'pending') {
          pending.status = 'failed'
        }
      }
    )
    return { ...pending }
  }

  getCodexLoginUrl(): string | null {
    return this.requireServices().codexAccounts.getPendingLoginUrl()
  }

  manageCredential(operation: AccountCredentialOperation) {
    return manageAccountCredential(operation, this.requireServices().rateLimits)
  }

  setCommitMessageAgentEnvironment(resolvers: CommitMessageAgentEnvironmentResolvers): void {
    this.commitMessageAgentEnvironment = resolvers
  }

  getCommitMessageAgentEnvironment(): CommitMessageAgentEnvironmentResolvers | undefined {
    return this.commitMessageAgentEnvironment ?? undefined
  }

  getClaudeConfigDirectory(target: ClaudeAccountSelectionTarget): string | null {
    return this.services?.claudeAccounts.getRuntimeConfigDir(target) ?? null
  }

  getSnapshot(): AccountsSnapshot {
    const { claudeAccounts, codexAccounts, rateLimits } = this.requireServices()
    return {
      ...this.dataAccountsSnapshot(),
      claude: claudeAccounts.listAccounts(),
      codex: codexAccounts.listAccounts(),
      rateLimits: rateLimits.getState()
    }
  }

  dataAccountsSnapshot(): Pick<AccountsSnapshot, 'opencode' | 'devin'> {
    if (!hasAppEnvironment()) {
      return {}
    }
    const service = getManagedDataAccountService()
    return { opencode: service.list('opencode'), devin: service.list('devin') }
  }

  addDataFromHome(
    provider: ManagedDataAccountProvider,
    sourceDataHome: string,
    label: string
  ): Promise<ManagedDataAccountsState> {
    return getManagedDataAccountService().add(provider, sourceDataHome, label)
  }

  selectData(
    provider: ManagedDataAccountProvider,
    accountId: string | null
  ): Promise<ManagedDataAccountsState> {
    return getManagedDataAccountService().select(provider, accountId)
  }

  removeData(
    provider: ManagedDataAccountProvider,
    accountId: string
  ): Promise<ManagedDataAccountsState> {
    return getManagedDataAccountService().remove(provider, accountId)
  }

  async refreshForMobile(): Promise<void> {
    const { rateLimits } = this.requireServices()
    await Promise.allSettled([
      rateLimits.refresh(),
      rateLimits.fetchInactiveClaudeAccountsOnOpen(),
      rateLimits.fetchInactiveCodexAccountsOnOpen()
    ])
  }

  async refreshForMobileSubscriber(): Promise<void> {
    const { rateLimits } = this.requireServices()
    await Promise.allSettled([
      rateLimits.refreshIfStale(),
      rateLimits.fetchInactiveClaudeAccountsOnOpen(),
      rateLimits.fetchInactiveCodexAccountsOnOpen()
    ])
  }

  selectClaude(accountId: string | null): Promise<ClaudeRateLimitAccountsState> {
    return this.requireServices().claudeAccounts.selectAccount(accountId)
  }

  selectClaudeForTarget(
    accountId: string | null,
    target: ClaudeAccountSelectionTarget
  ): Promise<ClaudeRateLimitAccountsState> {
    return this.requireServices().claudeAccounts.selectAccountForTarget(accountId, target)
  }

  selectCodex(accountId: string | null): Promise<CodexRateLimitAccountsState> {
    return this.requireServices().codexAccounts.selectAccount(accountId)
  }

  selectCodexForTarget(
    accountId: string | null,
    target: CodexAccountSelectionTarget
  ): Promise<CodexRateLimitAccountsState> {
    return this.requireServices().codexAccounts.selectAccountForTarget(accountId, target)
  }

  async consumeCodexResetCredit(
    idempotencyKey: string,
    expectedScope: CodexResetCreditExpectedScope
  ): Promise<CodexRateLimitResetRpcResult> {
    const { claudeAccounts, codexAccounts } = this.requireServices()
    const result = await codexAccounts.consumeRateLimitResetCredit(idempotencyKey, expectedScope)
    const snapshot = {
      claude: claudeAccounts.listAccounts(),
      codex: result.codex,
      rateLimits: result.rateLimits
    }
    if ('status' in result) {
      return {
        status: result.status,
        retryDisposition: result.retryDisposition,
        reason: result.reason,
        scope: result.scope,
        snapshot
      }
    }
    return { outcome: result.outcome, scope: result.scope, snapshot }
  }

  removeClaude(accountId: string): Promise<ClaudeRateLimitAccountsState> {
    return this.requireServices().claudeAccounts.removeAccount(accountId)
  }

  addClaudeFromConfigDir(
    configDir: string,
    options?: {
      runtime?: 'host' | 'wsl'
      wslDistro?: string | null
      previousLegacyCredentialsSha256?: string | null
    }
  ): Promise<ClaudeRateLimitAccountsState> {
    return this.requireServices().claudeAccounts.addAccountFromConfigDir(configDir, options)
  }

  removeCodex(accountId: string): Promise<CodexRateLimitAccountsState> {
    return this.requireServices().codexAccounts.removeAccount(accountId)
  }

  addCodexFromHome(
    sourceHome: string,
    target?: { runtime?: 'host' | 'wsl'; wslDistro?: string | null }
  ): Promise<CodexRateLimitAccountsState> {
    return this.requireServices().codexAccounts.addAccountFromHome(sourceHome, target)
  }

  observeCodexLogin(listener: (pending: boolean, revision: number) => void): () => void {
    const service = this.requireServices().codexAccounts
    let revision = 0
    const unsubscribe = service.onPendingLoginUrlChanged((url) =>
      listener(url !== null, ++revision)
    )
    try {
      listener(service.getPendingLoginUrl() !== null, revision)
    } catch (error) {
      unsubscribe()
      throw error
    }
    return unsubscribe
  }

  onChanged(listener: (snapshot: AccountsSnapshot) => void): () => void {
    const services = this.requireServices()
    const unsubscribeData = hasAppEnvironment()
      ? getManagedDataAccountService().onChanged(() => listener(this.getSnapshot()))
      : () => {}
    const unsubscribeUsage = services.rateLimits.onStateChange((rateLimits) => {
      listener({
        ...this.dataAccountsSnapshot(),
        claude: services.claudeAccounts.listAccounts(),
        codex: services.codexAccounts.listAccounts(),
        rateLimits
      })
    })
    return () => {
      unsubscribeData()
      unsubscribeUsage()
    }
  }

  private requireServices(): RuntimeAccountServices {
    if (!this.services) {
      throw new Error('Account services are not configured on this runtime')
    }
    return this.services
  }
}
