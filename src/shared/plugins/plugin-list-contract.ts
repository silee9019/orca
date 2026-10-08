import type { PluginCommandInput } from './plugin-command-input'
import type { PluginCapabilityKind } from './plugin-capabilities'
import type { PluginCommandAliasActionId } from './plugin-command-actions'

export type PluginListPanelEntry = {
  id: string
  title: string
  icon?: string
  tabKey: `plugin:${string}`
}

export type PluginListStatus =
  | 'running'
  | 'restarting'
  | 'idle'
  | 'pending'
  | 'disabled'
  | 'errored'
  | 'invalid'

export type PluginListEntry = {
  pluginKey: string
  commandInputVersion?: 1
  /** Opaque identity of the exact capabilities and worker tier shown for review. */
  consentFingerprint: string | null
  name: string
  version: string
  publisher: string
  description?: string
  status: PluginListStatus
  needsReconsent: boolean
  error?: string
  isDev: boolean
  official: boolean
  bundled: boolean
  capabilities: { kind: PluginCapabilityKind; description: string }[]
  panels: PluginListPanelEntry[]
  commands: {
    id: string
    title: string
    input?: PluginCommandInput
    context: 'global' | 'worktree'
    handler: { type: 'built-in'; action: PluginCommandAliasActionId } | { type: 'worker' }
    keybindings: { key: string; when: 'global' | 'worktree' }[]
  }[]
  hasWorker: boolean
  vmRecipes: {
    id: string
    name: string
    description?: string
    commands: { phase: 'create' | 'suspend' | 'resume' | 'destroy'; command: string }[]
  }[]
  restarts: number
  blockedByKillList?: { reason: string; advisoryUrl?: string }
  source?: {
    kind: 'local-path' | 'git' | 'marketplace' | 'bundled'
    reference: string
    resolvedCommit: string | null
    contentHash: string
    marketplace?: { reference: string; resolvedCommit: string }
  }
}
