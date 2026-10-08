import { useCallback } from 'react'
import { toast } from 'sonner'
import { useMountedRef } from '@/hooks/useMountedRef'
import { translate } from '@/i18n/i18n'
import type { Platform } from './MobileHero'
import { ANDROID_INSTALL_GUIDE_URL, getInstallCopy, type IosChannel } from './mobile-platform-copy'

export function useMobileInstallActions(
  platform: Platform,
  iosChannel: IosChannel
): {
  copyInstallUrl: () => Promise<boolean>
  openAndroidInstallGuide: () => Promise<boolean>
  openInstallUrl: () => Promise<boolean>
} {
  const mountedRef = useMountedRef()

  const openInstallUrl = useCallback(async (): Promise<boolean> => {
    try {
      await window.api.shell.openUrl(getInstallCopy(platform, iosChannel).url)
      return true
    } catch {
      return false
    }
  }, [iosChannel, platform])

  const openAndroidInstallGuide = useCallback(async (): Promise<boolean> => {
    try {
      await window.api.shell.openUrl(ANDROID_INSTALL_GUIDE_URL)
      return true
    } catch {
      return false
    }
  }, [])

  const copyInstallUrl = useCallback(async (): Promise<boolean> => {
    try {
      await window.api.ui.writeClipboardText(getInstallCopy(platform, iosChannel).url)
      if (mountedRef.current) {
        toast.success(
          translate('auto.components.mobile.MobilePage.fad833de8d', 'Install link copied')
        )
      }
      return true
    } catch {
      console.error('writeClipboardText failed')
      if (mountedRef.current) {
        toast.error(
          translate('auto.components.mobile.MobilePage.baea63c445', 'Failed to copy link')
        )
      }
      return false
    }
  }, [iosChannel, mountedRef, platform])

  return { copyInstallUrl, openAndroidInstallGuide, openInstallUrl }
}
