import { fireEvent, screen } from '@testing-library/react'
import { vi, type Mock } from 'vitest'
import type { SkillCloudVersion } from '../../../../shared/skill-cloud-contract'
import type { SkillInstallProgress } from '../../../../shared/skill-sharing-contract'

export const DIGEST = 'a'.repeat(64)
const ARCHIVE_SHA = 'b'.repeat(64)

export function version(): SkillCloudVersion {
  return {
    packageId: 'pkg_1',
    versionId: 'ver_1',
    name: 'private-skill',
    description: 'A private skill',
    packageDigest: DIGEST,
    archiveSha256: ARCHIVE_SHA,
    compressedBytes: 128,
    createdAt: '2026-08-11T00:00:00.000Z',
    releaseNotes: '',
    manifest: {
      schemaVersion: 1,
      packageId: 'pkg_1',
      versionId: 'ver_1',
      name: 'private-skill',
      description: 'A private skill',
      createdAt: '2026-08-11T00:00:00.000Z',
      files: [
        {
          path: 'SKILL.md',
          size: 1,
          executable: false,
          classification: 'text',
          sha256: DIGEST,
          identitySha256: DIGEST
        }
      ],
      packageDigest: DIGEST
    }
  }
}

export function bundleVersion(): SkillCloudVersion {
  const skill = (id: string, name: string) => ({
    id,
    name,
    description: `${name} description`,
    digest: DIGEST,
    files: [
      {
        path: 'SKILL.md',
        size: 1,
        executable: false,
        classification: 'text' as const,
        sha256: DIGEST,
        identitySha256: DIGEST
      }
    ]
  })
  return {
    ...version(),
    name: 'team-bundle',
    description: 'Two private skills',
    packageDigest: 'c'.repeat(64),
    releaseNotes: 'Initial team bundle',
    manifest: {
      schemaVersion: 1,
      packageId: 'pkg_1',
      versionId: 'ver_1',
      bundleName: 'team-bundle',
      description: 'Two private skills',
      createdAt: '2026-08-11T00:00:00.000Z',
      skills: [skill('skill-alpha', 'alpha'), skill('skill-beta', 'beta')],
      bundleDigest: 'c'.repeat(64)
    }
  }
}

export function detectionApi(agents: string[]): { detectAgents: Mock; detectRemoteAgents: Mock } {
  return {
    detectAgents: vi.fn().mockResolvedValue(agents),
    detectRemoteAgents: vi.fn().mockResolvedValue(agents)
  }
}

export function installApi(previewInstall: Mock): {
  resolveShare: Mock
  previewInstall: Mock
  previewBundleInstall: Mock
  installShare: Mock
  installBundleShare: Mock
  cancelInstall: Mock
  listWslDistros: Mock
  onInstallProgress: Mock
  emitInstallProgress: (progress: SkillInstallProgress) => void
} {
  let progressListener: ((progress: SkillInstallProgress) => void) | null = null
  return {
    resolveShare: vi
      .fn()
      .mockResolvedValue({ status: 'ok', value: { id: 'share_1', version: version() } }),
    previewInstall,
    previewBundleInstall: vi.fn(),
    installShare: vi.fn().mockResolvedValue({
      status: 'ok',
      value: {
        operationId: 'op_1',
        status: 'installed',
        name: 'private-skill',
        packageDigest: DIGEST,
        placements: []
      }
    }),
    installBundleShare: vi.fn(),
    cancelInstall: vi.fn().mockResolvedValue({ cancelled: true }),
    listWslDistros: vi.fn().mockResolvedValue([]),
    onInstallProgress: vi.fn((listener) => {
      progressListener = listener
      return () => {
        progressListener = null
      }
    }),
    emitInstallProgress: (progress: SkillInstallProgress) => progressListener?.(progress)
  }
}

export async function inspectSkill(expectedDescription = 'A private skill'): Promise<void> {
  fireEvent.change(screen.getByLabelText('Orca skill link'), {
    target: { value: 'https://app.orca.dev/skills/share/share_1' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Inspect skill' }))
  await screen.findByText(expectedDescription)
}
