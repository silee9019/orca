import { AccountMountedActionError } from '../../../shared/account-mounted-viewer-command'
import type { BitbucketAuthMode } from '../../../shared/bitbucket-credentials'
import type { TuiAgent } from '../../../shared/tui-agent'
import type { AccountMountedViewerAction } from '../../../shared/account-mounted-viewer-command'

export type MiniMaxDraftControls = {
  cookie: (value: string) => void
  apiKey: (value: string) => void
}
export type SecretDraftControls = { set: (value: string) => void }
export type BitbucketDraftControls = {
  authMode: (value: BitbucketAuthMode) => void
  email: (value: string) => void
  apiToken: (value: string) => void
  accessToken: (value: string) => void
  baseUrl: (value: string) => void
}
const miniMax = new Set<MiniMaxDraftControls>()
const openCodeGoCommit = new Set<{ run: (operation: 'save' | 'clear') => Promise<void> }>()
const openCodeGo = new Set<SecretDraftControls>()
const zcodePlan = new Set<SecretDraftControls>()
const bitbucket = new Set<BitbucketDraftControls>()
const agentEnvs = new Map<TuiAgent, Set<SecretDraftControls>>()

export function registerMiniMaxDraftControls(controls: MiniMaxDraftControls) {
  miniMax.add(controls)
  return () => {
    miniMax.delete(controls)
  }
}
export function registerOpenCodeGoDraftControls(controls: SecretDraftControls) {
  openCodeGo.add(controls)
  return () => {
    openCodeGo.delete(controls)
  }
}
export function registerZcodePlanDraftControls(controls: SecretDraftControls) {
  zcodePlan.add(controls)
  return () => {
    zcodePlan.delete(controls)
  }
}
export function registerBitbucketDraftControls(controls: BitbucketDraftControls) {
  bitbucket.add(controls)
  return () => {
    bitbucket.delete(controls)
  }
}
export function registerAgentEnvDraftControls(agent: TuiAgent, controls: SecretDraftControls) {
  const entries = agentEnvs.get(agent) ?? new Set<SecretDraftControls>()
  agentEnvs.set(agent, entries)
  entries.add(controls)
  return () => {
    entries.delete(controls)
    if (entries.size === 0) {
      agentEnvs.delete(agent)
    }
  }
}

export function requireSingleMountedAccountControls<T>(entries: ReadonlySet<T> | undefined): T {
  const controls = entries?.values().next().value
  if (entries?.size !== 1 || !controls) {
    throw new AccountMountedActionError(entries && entries.size > 1 ? 'ambiguous' : 'unavailable')
  }
  return controls
}

export function applyMountedAccountDraft(action: AccountMountedViewerAction): boolean {
  switch (action.type) {
    case 'account-minimax-draft': {
      const controls = requireSingleMountedAccountControls(miniMax)
      if (action.field === 'cookie') {
        controls.cookie(action.value)
      } else {
        controls.apiKey(action.value)
      }
      return true
    }
    case 'account-opencode-go-draft':
      requireSingleMountedAccountControls(openCodeGo).set(action.value)
      return true
    case 'account-zcode-plan-draft':
      requireSingleMountedAccountControls(zcodePlan).set(action.value)
      return true
    case 'account-agent-env-draft':
      requireSingleMountedAccountControls(agentEnvs.get(action.agent)).set(action.value)
      return true
    case 'account-bitbucket-draft': {
      const controls = requireSingleMountedAccountControls(bitbucket)
      switch (action.field) {
        case 'auth-mode':
          if (action.value !== 'basic' && action.value !== 'token') {
            throw new AccountMountedActionError('invalid_argument')
          }
          controls.authMode(action.value)
          break
        case 'email':
          controls.email(action.value)
          break
        case 'api-token':
          controls.apiToken(action.value)
          break
        case 'access-token':
          controls.accessToken(action.value)
          break
        case 'base-url':
          controls.baseUrl(action.value)
          break
      }
      return true
    }
    case 'account-bitbucket-dialog':
    case 'account-bitbucket-outside-dismiss':
    case 'account-onboarding-yolo-draft':
    case 'account-opencode-go-commit':
    case 'account-orca-signout-dialog':
    case 'account-removal-dialog':
    case 'account-switcher-runtime':
    case 'account-switcher-toggle':
      return false
  }
}

export function registerOpenCodeGoCommitControls(controls: {
  run: (operation: 'save' | 'clear') => Promise<void>
}) {
  openCodeGoCommit.add(controls)
  return () => {
    openCodeGoCommit.delete(controls)
  }
}
export async function applyMountedOpenCodeGoCommit(operation: 'save' | 'clear') {
  await requireSingleMountedAccountControls(openCodeGoCommit).run(operation)
  return { status: 'accepted' }
}
