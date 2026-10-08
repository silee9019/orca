import type { DiscoveredSkill, SkillDiscoverySource } from '../../../shared/skills'

export type InstalledAgentSkillState = {
  installed: boolean
  loading: boolean
  // Why: a forced rescan keeps the previous result, so only the first scan per
  // runtime-scoped target is genuinely unknown.
  settled: boolean
  // A negative this scan cannot vouch for: render it as unknown, not as undone.
  installedUnverifiable: boolean
  error: string | null
  skills: readonly DiscoveredSkill[]
  sources: readonly SkillDiscoverySource[]
  refresh: () => Promise<boolean>
  refreshWithReceipt?: () => Promise<(() => boolean) | undefined>
}
