import { homedir } from 'node:os'
import { join } from 'node:path'
import type { GlobalSettings } from '../shared/global-settings-types'
import { getDefaultWorkspaceDir } from '../shared/constants'
import { normalizeRuntimePathForComparison } from '../shared/cross-platform-path'
import { LOCAL_EXECUTION_HOST_ID } from '../shared/execution-host'
import { getEffectiveHostSetting } from '../shared/host-setting-overrides'

export function getDefaultProjectParent(
  settings: Pick<GlobalSettings, 'workspaceDir' | 'hostSettingOverrides'>,
  home = homedir()
): string {
  const configured = getEffectiveHostSetting(
    settings,
    LOCAL_EXECUTION_HOST_ID,
    'defaultWorktreeLocation',
    settings.workspaceDir ?? ''
  ).trim()
  // Untouched workspace defaults must not become project roots.
  const isUntouchedDefault =
    normalizeRuntimePathForComparison(configured) ===
    normalizeRuntimePathForComparison(getDefaultWorkspaceDir(home))
  return configured && !isUntouchedDefault ? configured : join(home, 'orca', 'projects')
}
