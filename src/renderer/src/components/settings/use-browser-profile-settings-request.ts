import { useRef } from 'react'
import type { BrowserSessionProfile } from '../../../../shared/browser-workspace-types'
import { useBrowserSettingsRequest } from './use-browser-settings-request'
import { getBrowserSettingsHostId } from '@/store/slices/browser/browser-host-state'
import { useAppStore } from '@/store'
type Options = {
  surface: 'profile-row' | 'browser-use'
  profileId: string
  busy: boolean
  importFromBrowser: (family: string, profile?: string) => Promise<boolean>
  importFromFile: (filePath?: string) => Promise<boolean>
  deleteProfile?: () => Promise<boolean>
  clearDefault?: () => Promise<boolean>
  configure?: () => void | Promise<boolean>
}
export function useBrowserProfileSettingsRequest(options: Options): void {
  const inFlight = useRef(false)
  useBrowserSettingsRequest({
    accepts: (command) => {
      if (!('profileId' in command) || command.profileId !== options.profileId) {
        return false
      }
      if ('surface' in command) {
        return command.surface === options.surface
      }
      return (
        options.surface === 'profile-row' &&
        (command.action === 'profile-delete' || command.action === 'default-cookies-clear')
      )
    },
    apply: async (command) => {
      if (command.action === 'cookies-configure') {
        if ((await options.configure?.()) !== true) {
          throw new Error('cookie_configuration_not_acknowledged')
        }
        return
      }
      if (command.action === 'profile-status') {
        return
      }
      if (
        options.busy ||
        inFlight.current ||
        useAppStore.getState().browserSessionImportState?.status === 'importing'
      ) {
        throw new Error('browser_profile_busy')
      }
      inFlight.current = true
      try {
        if (command.action === 'detect-browsers') {
          await useAppStore.getState().fetchDetectedBrowsers()
          return
        }
        if (!('confirmation' in command) || command.confirmation !== options.profileId) {
          throw new Error('browser_profile_confirmation_required')
        }
        let ok = false
        if (command.action === 'cookies-import-browser') {
          const browser = useAppStore
            .getState()
            .detectedBrowsers.find((value) => value.family === command.browserFamily)
          if (
            !browser ||
            (command.browserProfile &&
              !browser.profiles.some((value) => value.directory === command.browserProfile))
          ) {
            throw new Error('browser_import_source_unavailable')
          }
          ok = await options.importFromBrowser(command.browserFamily, command.browserProfile)
        } else if (command.action === 'cookies-import-file') {
          ok = await options.importFromFile(command.filePath)
        } else if (command.action === 'profile-delete' && options.profileId !== 'default') {
          ok = (await options.deleteProfile?.()) === true
        } else if (command.action === 'default-cookies-clear' && options.profileId === 'default') {
          if (
            !useAppStore.getState().browserSessionProfiles.find((value) => value.id === 'default')
              ?.source
          ) {
            throw new Error('default_cookies_not_imported')
          }
          ok = (await options.clearDefault?.()) === true
        }
        if (!ok) {
          throw new Error('browser_profile_action_failed')
        }
      } finally {
        inFlight.current = false
      }
    },
    read: () => {
      const state = useAppStore.getState()
      const profile: BrowserSessionProfile | undefined = state.browserSessionProfiles.find(
        (value) => value.id === options.profileId
      )
      const importing =
        state.browserSessionImportState?.profileId === options.profileId
          ? state.browserSessionImportState
          : null
      return {
        hostId: getBrowserSettingsHostId(state),
        profileId: options.profileId,
        importStatus: importing?.status ?? null,
        importedCookieCount: importing?.summary?.importedCookies,
        detectedBrowserFamilies: state.detectedBrowsers.map((value) => value.family),
        cookieSourcePresent: !!profile?.source
      }
    }
  })
}
