import type { CliWarpThemeImportSource } from '../../shared/rpc-contract/settings-control-params'
import { AccountInspectionController } from './account-inspection-controller'
import { RuntimeUsageController, type RuntimeUsageProviders } from './runtime-usage-controller'
import {
  RuntimeRateLimitController,
  type RuntimeRateLimitService
} from './runtime-rate-limit-controller'
import {
  MobileRelayObservationSchema,
  type MobileRelayObservation
} from '../../shared/mobile-relay-observation'
import {
  SshPortObservationSchema,
  type SshPortObservation
} from '../../shared/ssh-port-observation'
import {
  SshCredentialObservationSchema,
  type SshCredentialObservation
} from '../../shared/ssh-credential-observation'
import { readMacCapturedDigitRowChords } from '../macos-keyboard-probes'
import { getRepoForExecutionHost } from '../repo-execution-host-selection'
import { RuntimeRepositoryRefQueries } from './runtime-repository-ref-queries'
import { REPO_SEARCH_REFS_DEFAULT_LIMIT } from '../../shared/repo-search-limits'
import type { RepoHostRefSearchArgs } from '../../shared/rpc-contract/workspace-repo-host-params'
import { installRuntimeLinearCommandSurface } from './runtime-linear-command-surface'
import { OrcaRuntimeWithResolveWaiter } from './orca-runtime-resolve-waiter'
import type { RuntimeCommandSurfaceHost } from './orca-runtime-core'
import { registerWorktreeChangeInvalidator } from '../ipc/worktree-change-invalidators'
import { registerDetectedWorktreeScanInvalidation } from '../ipc/worktrees/listing/register-detected-worktree-scan-invalidation'
import type { RuntimeSettingsActions } from './runtime-settings-actions'
import type { KeybindingActionId } from '../../shared/keybindings'
import type { GlobalSettings } from '../../shared/global-settings-types'
import { readWorkspaceCleanupScanSnapshot } from '../workspace-cleanup-scan-snapshot'
import { readWorkspaceSpaceAnalysisSnapshot } from '../workspace-space-analysis-snapshot'
import type { ExecutionHostId } from '../../shared/execution-host'
import { invalidateAuthorizedRootsCache } from '../ipc/filesystem-auth'
import { getDefaultProjectParent } from '../project-default-parent'
import { mergeWorkspaceCleanupDismissals } from '../workspace-cleanup-dismissals'
import type { WorkspaceCleanupDismissArgs } from '../../shared/workspace-cleanup'
import { enrichRepoGitUsernames } from '../repo-git-username-enrichment'

class OrcaRuntimeService extends OrcaRuntimeWithResolveWaiter {
  private readonly settingsActions: RuntimeSettingsActions | undefined
  private accountInspectionController: AccountInspectionController | null = null
  setAccountInspectionServices(
    ...args: ConstructorParameters<typeof AccountInspectionController>
  ): void {
    this.accountInspectionController = new AccountInspectionController(...args)
  }
  getAccountInspectionController(): AccountInspectionController {
    if (!this.accountInspectionController) {
      throw new Error('Account inspection services are unavailable on this runtime')
    }
    return this.accountInspectionController
  }

  private usageController: RuntimeUsageController | null = null
  private rateLimitController: RuntimeRateLimitController | null = null

  setUsageServices(providers: RuntimeUsageProviders, rateLimits: RuntimeRateLimitService): void {
    this.usageController = new RuntimeUsageController(providers)
    this.rateLimitController = new RuntimeRateLimitController(rateLimits)
  }

  getUsageController(): RuntimeUsageController {
    if (!this.usageController) {
      throw new Error('Usage services are not configured on this runtime')
    }
    return this.usageController
  }

  getRateLimitController(): RuntimeRateLimitController {
    if (!this.rateLimitController) {
      throw new Error('Rate-limit services are not configured on this runtime')
    }
    return this.rateLimitController
  }

  notifySshCredentialObservation(observation: SshCredentialObservation): void {
    const parsed = SshCredentialObservationSchema.safeParse(observation)
    if (parsed.success) {
      this.emitClientEvent({ type: 'sshCredentialsChanged', observation: parsed.data })
    }
  }

  notifySshPortObservation(observation: SshPortObservation): void {
    const parsed = SshPortObservationSchema.safeParse(observation)
    if (parsed.success) {
      this.emitClientEvent({ type: 'sshPortsChanged', observation: parsed.data })
    }
  }

  notifyMobileRelayObservation(observation: MobileRelayObservation): void {
    const parsed = MobileRelayObservationSchema.safeParse(observation)
    if (parsed.success) {
      this.emitClientEvent({ type: 'mobileRelayChanged', observation: parsed.data })
    }
  }

  getMacCapturedDigitRowChords() {
    return readMacCapturedDigitRowChords()
  }

  async searchRepoRefsForHost(params: RepoHostRefSearchArgs, includeQualifiedRefs = true) {
    const repo = getRepoForExecutionHost(this.requireStore(), params.repoId, params.hostId)
    if (!repo) {
      throw new Error('repo_not_found')
    }
    return new RuntimeRepositoryRefQueries({ resolveRepo: async () => repo }).search(
      params.repoId,
      params.query,
      params.limit ?? REPO_SEARCH_REFS_DEFAULT_LIMIT,
      includeQualifiedRefs
    )
  }

  async dismissWorkspaceCleanup(args?: WorkspaceCleanupDismissArgs): Promise<{
    ok: true
    dismissalCount: number
  }> {
    const store = this.requireStore()
    const dismissals = args
      ? mergeWorkspaceCleanupDismissals(store.getUI().workspaceCleanup?.dismissals, args)
      : {}
    store.updateUI({ workspaceCleanup: { dismissals } })
    await store.flushPendingOrThrowAsync()
    return { ok: true, dismissalCount: Object.keys(dismissals).length }
  }

  getDefaultCreateProjectParent(): string {
    return getDefaultProjectParent(this.requireStore().getSettings())
  }

  enrichRepoGitUsernames(): void {
    if (!this.store) {
      return
    }
    enrichRepoGitUsernames(this.requireStore(), {
      onChanged: () => {
        this.invalidateResolvedWorktreeCache()
        this.notifyReposChanged()
      }
    })
  }

  removeProjectForHost(repoId: string, hostId: ExecutionHostId): { ok: true } {
    this.requireStore().removeProjectForHost(repoId, hostId)
    invalidateAuthorizedRootsCache()
    this.invalidateWorktreeCatalog(repoId)
    this.notifyReposChanged()
    return { ok: true }
  }

  reorderReposForHost(
    orderedIds: string[],
    hostId: ExecutionHostId
  ): { ok: boolean; status: 'applied' | 'rejected' } {
    const applied = this.requireStore().reorderReposForHost(orderedIds, hostId)
    if (applied) {
      this.invalidateResolvedWorktreeCache()
      this.notifyReposChanged()
    }
    return { ok: applied, status: applied ? 'applied' : 'rejected' }
  }

  getCachedWorkspaceCleanupScan() {
    return readWorkspaceCleanupScanSnapshot(this.requireStore().getProfileStorageDirectory())
  }

  getCachedWorkspaceSpaceAnalysis() {
    return readWorkspaceSpaceAnalysisSnapshot(this.requireStore().getProfileStorageDirectory())
  }

  constructor(...args: ConstructorParameters<typeof OrcaRuntimeWithResolveWaiter>) {
    super(...args)
    this.settingsActions = args[2]?.settingsActions
    // Why: the runtime listing re-runs a scan the worktree-change generation overtook and re-lists
    // through this runtime's scan cache, so a worktree change must reach both. The desktop IPC
    // module registers the generation bump at load; a headless host never loads it.
    registerDetectedWorktreeScanInvalidation()
    registerWorktreeChangeInvalidator((repoId) => this.invalidateWorktreeCatalog(repoId))
  }

  previewSettingsGhosttyImport() {
    return this.requireSettingsActions().previewGhosttyImport()
  }

  previewSettingsWarpThemes(source: CliWarpThemeImportSource) {
    return this.requireSettingsActions().previewWarpThemes(source)
  }

  getSettingsKeybindings() {
    return this.requireSettingsActions().getKeybindings()
  }

  getDesktopControlSettings() {
    return this.requireSettingsActions().getDesktopSettings()
  }

  updateDesktopControlSettings(updates: Partial<GlobalSettings>) {
    return this.requireSettingsActions().updateDesktopSettings(updates)
  }

  reloadSettingsKeybindings() {
    return this.requireSettingsActions().reloadKeybindings()
  }

  setSettingsKeybinding(actionId: KeybindingActionId, bindings: string[] | null) {
    return this.requireSettingsActions().setKeybinding(actionId, bindings)
  }

  listSettingsFonts() {
    return this.requireSettingsActions().listFonts()
  }

  private requireSettingsActions(): RuntimeSettingsActions {
    if (!this.settingsActions) {
      throw new Error('settings_viewer_unavailable')
    }
    return this.settingsActions
  }
}
type OrcaRuntimeServiceExport = RuntimeCommandSurfaceHost<OrcaRuntimeService>
const OrcaRuntimeServiceExport = OrcaRuntimeService as unknown as {
  new (...args: ConstructorParameters<typeof OrcaRuntimeService>): OrcaRuntimeServiceExport
  readonly prototype: OrcaRuntimeServiceExport
}
export { OrcaRuntimeServiceExport as OrcaRuntimeService }
installRuntimeLinearCommandSurface(OrcaRuntimeServiceExport.prototype)

export type { LegacyWorkerTerminalRecoveryResult } from './runtime-legacy-worker-terminal-recovery-types'
export type {
  RuntimeAutomationCreateInput,
  RuntimeAutomationUpdateInput
} from './runtime-automation-controller'
export type { SubscriptionRegistration } from './runtime-subscription-registry'
export type {
  OrchestrationCompatibilityCallerAuthority,
  OrchestrationCompatibilityTerminalAuthority,
  RuntimePtyDataAdmission,
  RuntimeTerminalAgentStatusEvent
} from './runtime-terminal-contracts'
export type { MessageWaitResult } from './runtime-message-waiters'
export type { AccountsSnapshot, CodexRateLimitResetRpcResult } from './runtime-account-controller'
export type {
  MobileNotificationDispatchEvent,
  MobileNotificationDismissEvent,
  MobileNotificationEvent
} from './runtime-mobile-notification-controller'
export type { RuntimeTerminalDataMeta } from './runtime-terminal-stream-consumers'
export type { RemoteFetchResult, RemoteTrackingBase } from './runtime-remote-fetch-controller'
export {
  computeTerminalTailWaitState,
  tailGainedNewerBlockedReason,
  type TerminalTailWaitState
} from './terminal-wait-tail-state'
export { appendNormalizedToTailBuffer } from './terminal-tail-buffer'
export { appendNormalizedToMultilineTailBufferUnwindowed } from './terminal-tail-redraw-buffer'
export { buildPreview } from './terminal-tail-state'
export { buildRestoredTerminalTailSeed } from './terminal-tail-restore-seed'
export { projectTerminalTailLines } from './orca-runtime-terminal-projection'
export { resolveWorktreeScanCacheTtlMs } from './runtime-worktree-scan-cache'
export type {
  RuntimeWorktreeLifecycleEvent,
  DriverState,
  PtyLayoutTarget,
  PtyLayoutState,
  ApplyLayoutResult,
  RuntimeRendererReloadFence
} from './orca-runtime-core'
export {
  AUTHORITATIVE_TERMINAL_SNAPSHOT_TIMEOUT_MS,
  WORKTREE_SCAN_ADMIN_RECONCILE_INTERVAL_MS,
  WORKTREE_SCAN_ADMIN_FINGERPRINT_TIMEOUT_MS
} from './orca-runtime-postlude'
