import type { MobileNetworkInterface } from '@/components/settings/mobile-network-interface-selection'
export type MobilePageViewerActions = {
  copyPairing?: () => Promise<boolean | void>
  copyInstall?: () => Promise<boolean | void>
  openInstall?: () => Promise<boolean | void>
  openAndroidGuide?: () => Promise<boolean | void>
  copyDiagnostics?: () => Promise<boolean | void>
  refreshNetwork?: () => Promise<readonly MobileNetworkInterface[] | null | void>
  networkInterfaces?: () => readonly MobileNetworkInterface[]
  closePage?: () => boolean | void
  pageOpen?: () => boolean
  toggleSidebar?: () => Promise<{ applied: boolean; persisted: boolean; value: boolean } | void>
  sidebarShown?: () => boolean
}
export type MobilePageViewerAction =
  | 'mobile.copy-pairing'
  | 'mobile.copy-install'
  | 'mobile.open-install'
  | 'mobile.open-android-guide'
  | 'mobile.copy-diagnostics'
  | 'mobile.refresh-network'
  | 'mobile.close'
  | 'mobile.sidebar-toggle'
export async function performMobilePageViewerAction(
  owner: MobilePageViewerActions,
  operation: MobilePageViewerAction,
  expiresAt: number,
  current: () => boolean
): Promise<{ applied: boolean; persisted: boolean | null; closed?: boolean }> {
  let matches: (() => boolean) | null = null
  let applied = false
  let persisted: boolean | null = null
  switch (operation) {
    case 'mobile.close': {
      if (!owner.closePage || !owner.pageOpen) {
        throw new Error('connections_surface_unavailable')
      }
      if (!owner.pageOpen()) {
        throw new Error('connections_surface_unavailable')
      }
      const completed = owner.closePage() === true
      if (Date.now() >= expiresAt) {
        throw new Error('request_expired')
      }
      return {
        applied: completed && !owner.pageOpen(),
        persisted: null,
        closed: completed && !owner.pageOpen()
      }
    }
    case 'mobile.sidebar-toggle': {
      if (!owner.toggleSidebar || !owner.sidebarShown) {
        throw new Error('connections_surface_unavailable')
      }
      const result = await owner.toggleSidebar()
      persisted = result?.persisted ?? false
      applied = result?.applied === true
      if (result) {
        const value = result.value
        matches = () => owner.sidebarShown?.() === value
      }
      break
    }
    case 'mobile.refresh-network': {
      if (!owner.refreshNetwork || !owner.networkInterfaces) {
        throw new Error('connections_surface_unavailable')
      }
      const interfaces = await owner.refreshNetwork()
      applied = interfaces != null
      if (interfaces) {
        matches = () => owner.networkInterfaces?.() === interfaces
      }
      break
    }
    case 'mobile.copy-pairing':
    case 'mobile.copy-install':
    case 'mobile.open-install':
    case 'mobile.open-android-guide':
    case 'mobile.copy-diagnostics': {
      const action =
        operation === 'mobile.copy-pairing'
          ? owner.copyPairing
          : operation === 'mobile.copy-install'
            ? owner.copyInstall
            : operation === 'mobile.open-install'
              ? owner.openInstall
              : operation === 'mobile.open-android-guide'
                ? owner.openAndroidGuide
                : owner.copyDiagnostics
      if (!action) {
        throw new Error('connections_surface_unavailable')
      }
      applied = (await action()) === true
      break
    }
  }
  while (applied && matches && !matches() && current() && Date.now() < expiresAt) {
    await new Promise((resolve) => setTimeout(resolve, 16))
  }
  if (!current() || Date.now() >= expiresAt) {
    throw new Error('request_expired')
  }
  return { applied: applied && (!matches || matches()), persisted }
}
