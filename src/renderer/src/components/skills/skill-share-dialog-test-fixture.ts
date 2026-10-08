import type { DiscoveredSkill } from '../../../../shared/skills'
import type { SkillSharePreview } from '../../../../shared/skill-sharing-contract'

export const skill: DiscoveredSkill = {
  id: 'home:private-skill',
  name: 'private-skill',
  description: 'Private skill',
  providers: ['codex'],
  sourceKind: 'home',
  sourceLabel: 'Home',
  rootPath: '/home/skills',
  directoryPath: '/home/skills/private-skill',
  skillFilePath: '/home/skills/private-skill/SKILL.md',
  installed: true,
  updatedAt: null
}

export const preview: SkillSharePreview = {
  preparationId: '11111111-1111-4111-8111-111111111111',
  packageId: 'pkg_1',
  versionId: 'ver_2',
  name: 'private-skill',
  description: 'Private skill',
  packageDigest: 'a'.repeat(64),
  archiveSha256: 'b'.repeat(64),
  fileCount: 1,
  totalBytes: 128,
  compressedBytes: 96,
  scriptPaths: [],
  executablePaths: [],
  expiresAt: '2026-08-11T01:00:00.000Z'
}

export const secondSkill: DiscoveredSkill = {
  ...skill,
  id: 'home:second-skill',
  name: 'second-skill',
  description: 'Second skill',
  directoryPath: '/home/skills/second-skill',
  skillFilePath: '/home/skills/second-skill/SKILL.md'
}
