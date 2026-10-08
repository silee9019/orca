import { join } from 'node:path'
import { getSystemCodexHomePath } from './codex-home-paths'
import { getCodexConfigSyncStatus } from './config-sync-stall'
import type { CodexConfigSyncStatus } from '../../shared/codex-config-sync-types'
import type { CodexMirroredHomeStatus } from '../codex-accounts/runtime-home-service'

export type CodexMirroredHomeResolver = {
  getMirroredHostHomePathForStatus: () => CodexMirroredHomeStatus
}

export function readCodexConfigSyncStatus(
  runtimeHome: CodexMirroredHomeResolver
): CodexConfigSyncStatus {
  const systemHomePath = getSystemCodexHomePath()
  const mirrored = runtimeHome.getMirroredHostHomePathForStatus()
  if (mirrored.kind === 'unavailable') {
    return {
      state: 'stalled',
      reason: 'managed-home-unavailable',
      systemConfigPath: join(systemHomePath, 'config.toml')
    }
  }
  if (!mirrored.homePath) {
    return { state: 'synced', reason: null, systemConfigPath: join(systemHomePath, 'config.toml') }
  }
  return getCodexConfigSyncStatus({ runtimeHomePath: mirrored.homePath, systemHomePath })
}
