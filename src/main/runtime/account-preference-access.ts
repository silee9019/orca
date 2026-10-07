import type { GlobalSettings } from '../../shared/global-settings-types'
import type { AccountPreferenceOperation } from '../../shared/rpc-contract/account-preference-params'

type AccountPreferences = Pick<
  GlobalSettings,
  | 'localAccountRuntime'
  | 'localAccountWslDistro'
  | 'minimaxEndpoint'
  | 'zcodePlanSite'
  | 'opencodeWorkspaceId'
>
export type AccountPreferenceAccess = {
  read: () => AccountPreferences
  write: (patch: Partial<AccountPreferences>) => Promise<unknown>
  validateWslTarget?: (distro: string | null) => Promise<void>
}
let access: AccountPreferenceAccess | null = null

export function setAccountPreferenceAccess(next: AccountPreferenceAccess | null): void {
  access = next
}

async function makePatch(
  operation: Extract<AccountPreferenceOperation, { action: 'set' }>,
  canonical: AccountPreferenceAccess
): Promise<Partial<AccountPreferences>> {
  switch (operation.key) {
    case 'localAccountRuntime': {
      if (operation.value !== 'host' && operation.value !== 'wsl') {
        throw new Error('Use host or wsl for account runtime.')
      }
      if (operation.value === 'wsl') {
        if (!canonical.validateWslTarget) {
          throw new Error('WSL account target validation is unavailable on this host.')
        }
        await canonical.validateWslTarget(canonical.read().localAccountWslDistro ?? null)
      }
      return { localAccountRuntime: operation.value }
    }
    case 'localAccountWslDistro': {
      const distro = operation.value === 'default' ? null : operation.value.trim()
      if (distro !== null && (!distro || distro.length > 255)) {
        throw new Error('Use a WSL distro name or default.')
      }
      if (!canonical.validateWslTarget) {
        throw new Error('WSL account target validation is unavailable on this host.')
      }
      await canonical.validateWslTarget(distro)
      return { localAccountRuntime: 'wsl', localAccountWslDistro: distro }
    }
    case 'minimaxEndpoint':
      if (operation.value !== 'overseas' && operation.value !== 'cn') {
        throw new Error('Use overseas or cn for MiniMax endpoint.')
      }
      return { minimaxEndpoint: operation.value }
    case 'zcodePlanSite':
      if (operation.value !== 'zai' && operation.value !== 'bigmodel') {
        throw new Error('Use zai or bigmodel for GLM Coding Plan site.')
      }
      return { zcodePlanSite: operation.value }
    case 'opencodeWorkspaceId':
      return { opencodeWorkspaceId: operation.value }
  }
}

export async function manageAccountPreference(operation: AccountPreferenceOperation) {
  const canonical = access
  if (!canonical) {
    throw new Error(
      'Account preferences require the canonical settings reader and writer on this host.'
    )
  }
  if (operation.action === 'set') {
    const patch = await makePatch(operation, canonical)
    try {
      await canonical.write(patch)
    } catch {
      throw new Error(
        'Could not apply the account preference through the canonical settings writer.'
      )
    }
    return { key: operation.key, updated: true }
  }
  const current = canonical.read()
  return {
    localAccountRuntime: current.localAccountRuntime ?? 'host',
    localAccountWslDistro: current.localAccountWslDistro ?? null,
    minimaxEndpoint: current.minimaxEndpoint,
    zcodePlanSite: current.zcodePlanSite ?? 'zai',
    opencodeWorkspaceConfigured: Boolean(current.opencodeWorkspaceId)
  }
}
