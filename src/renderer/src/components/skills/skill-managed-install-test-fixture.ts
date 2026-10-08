import { vi, type Mock } from 'vitest'
import type { ManagedSkillInstall } from '../../../../shared/skill-install-contract'
import type {
  SkillCloudPackageDetails,
  SkillCloudVersion
} from '../../../../shared/skill-cloud-contract'

export const DIGEST = 'a'.repeat(64)
const ARCHIVE_SHA = 'b'.repeat(64)

export function version(versionId: string, createdAt: string): SkillCloudVersion {
  return {
    packageId: 'pkg_1',
    versionId,
    name: 'private-skill',
    description: 'Private skill',
    packageDigest: DIGEST,
    archiveSha256: ARCHIVE_SHA,
    compressedBytes: 128,
    createdAt,
    releaseNotes: '',
    manifest: {
      schemaVersion: 1,
      packageId: 'pkg_1',
      versionId,
      name: 'private-skill',
      description: 'Private skill',
      createdAt,
      files: [],
      packageDigest: DIGEST
    }
  }
}

export function install(versionId: string): ManagedSkillInstall {
  return {
    name: 'private-skill',
    packageId: 'pkg_1',
    versionId,
    packageDigest: DIGEST,
    scope: 'global',
    destinationIdentity: 'global:local',
    destination: { scope: 'global' },
    installedAt: '2026-08-11T00:00:00.000Z',
    state: 'unchanged'
  }
}

export function packageDetails(versions: SkillCloudVersion[]): SkillCloudPackageDetails {
  return {
    id: 'pkg_1',
    name: 'private-skill',
    description: 'Private skill',
    createdAt: versions.at(-1)?.createdAt ?? '2026-08-11T00:00:00.000Z',
    canManage: true,
    versions
  }
}

export function skillsApi(
  installedInput: ManagedSkillInstall | ManagedSkillInstall[],
  versions: SkillCloudVersion[],
  details = packageDetails(versions)
): {
  listManagedInstalls: Mock
  getPackage: Mock
  installPackageVersion: Mock
  installBundlePackageVersion: Mock
  removeInstall: Mock
  revokeShare: Mock
  deletePackageVersion: Mock
  deletePackage: Mock
  cancelInstall: Mock
  onInstallProgress: Mock
  emitInstallProgress: (progress: {
    operationId: string
    phase: 'authorizing' | 'installing'
  }) => void
} {
  const installed = Array.isArray(installedInput) ? installedInput : [installedInput]
  let progressListener:
    | ((progress: { operationId: string; phase: 'authorizing' | 'installing' }) => void)
    | null = null
  return {
    listManagedInstalls: vi.fn().mockResolvedValue({ status: 'ok', value: installed }),
    getPackage: vi.fn().mockResolvedValue({ status: 'ok', value: details }),
    installPackageVersion: vi.fn().mockResolvedValue({
      status: 'ok',
      value: {
        operationId: 'operation_1',
        status: 'updated',
        name: installed[0]?.name ?? 'private-skill',
        packageDigest: DIGEST,
        placements: []
      }
    }),
    installBundlePackageVersion: vi.fn().mockResolvedValue({
      status: 'ok',
      value: {
        operationId: 'operation_bundle',
        packageId: 'pkg_1',
        versionId: versions[0]?.versionId ?? 'ver_1',
        bundleDigest: DIGEST,
        status: 'complete',
        skills: installed.map((skill) => ({
          skillId: skill.name,
          name: skill.name,
          digest: skill.packageDigest,
          status: 'updated',
          placements: []
        }))
      }
    }),
    removeInstall: vi.fn().mockResolvedValue({
      status: 'ok',
      value: {
        operationId: 'operation_2',
        status: 'removed',
        name: installed[0]?.name ?? 'private-skill',
        packageDigest: DIGEST,
        placements: []
      }
    }),
    revokeShare: vi.fn().mockResolvedValue({ status: 'ok', value: undefined }),
    deletePackageVersion: vi.fn().mockResolvedValue({ status: 'ok', value: undefined }),
    deletePackage: vi.fn().mockResolvedValue({ status: 'ok', value: undefined }),
    cancelInstall: vi.fn().mockResolvedValue({ cancelled: true }),
    onInstallProgress: vi.fn((listener) => {
      progressListener = listener
      return () => {
        progressListener = null
      }
    }),
    emitInstallProgress: (progress: { operationId: string; phase: 'authorizing' | 'installing' }) =>
      progressListener?.(progress)
  }
}

export function bundleVersion(versionId: string, names: string[]): SkillCloudVersion {
  const createdAt = '2026-08-12T00:00:00.000Z'
  return {
    ...version(versionId, createdAt),
    name: 'team-skills',
    manifest: {
      schemaVersion: 1,
      packageId: 'pkg_1',
      versionId,
      bundleName: 'team-skills',
      description: 'Team skills',
      createdAt,
      bundleDigest: DIGEST,
      skills: names.map((name) => ({
        id: name,
        name,
        description: `${name} description`,
        digest: DIGEST,
        files: []
      }))
    }
  }
}

export function bundleInstall(name: string, state: ManagedSkillInstall['state'] = 'unchanged') {
  return { ...install('ver_1'), name, bundleDigest: DIGEST, state }
}
