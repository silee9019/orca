import type {
  SkillFreshnessInstallation,
  SkillFreshnessInventory
} from '../../../../shared/skill-freshness'

export function placement(
  name: string,
  overrides: Partial<SkillFreshnessInstallation> = {}
): SkillFreshnessInstallation {
  return {
    id: `${name}-${overrides.rootId ?? 'home-agents'}`,
    name,
    rootId: 'home-agents',
    providers: ['agent-skills'],
    sourceKind: 'home',
    sourceLabel: 'Agent skills home',
    unresolvedPath: `/home/.agents/skills/${name}`,
    resolvedPath: `/home/.agents/skills/${name}`,
    physicalIdentity: `physical-${name}`,
    topology: 'canonical-copy',
    status: 'outdated',
    installedReleaseRevision: 1,
    installedAppVersion: '1.0.0',
    currentReleaseRevision: 2,
    currentPackageDigest: 'current',
    currentAppVersion: '2.0.0',
    observedPackageDigest: 'old',
    errorCategory: null,
    ...overrides
  }
}

export function eligibleInventory(): SkillFreshnessInventory {
  return {
    schemaVersion: 1,
    installations: [placement('orca-cli')],
    eligibleUpdateNames: ['orca-cli'],
    scanIssues: [],
    scannedAt: 1
  }
}
