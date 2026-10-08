import { toast } from 'sonner'
import { emitBrowserCookieImportToast } from '@/lib/browser-cookie-import-toast'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { BrowserCookieImportExecutionResult } from '@/store/slices/browser'

export function useBrowserToolbarCookieImports(effectiveProfileId: string) {
  const detectedBrowsers = useAppStore((s) => s.detectedBrowsers)
  const importCookiesFromBrowser = useAppStore((s) => s.importCookiesFromBrowser)
  const importCookiesToProfile = useAppStore((s) => s.importCookiesToProfile)
  const handleImportFromBrowser = async (
    browserFamily: string,
    browserProfile?: string
  ): Promise<BrowserCookieImportExecutionResult> => {
    const result = await importCookiesFromBrowser(effectiveProfileId, browserFamily, browserProfile)
    if (result.ok) {
      const browser = detectedBrowsers.find((b) => b.family === browserFamily)
      emitBrowserCookieImportToast(
        result.summary,
        browserProfile
          ? translate(
              'auto.components.browser.pane.BrowserToolbarMenu.c5f0e4d3b2a1',
              'Imported {{value0}} cookies from {{value1}} ({{value2}}).',
              {
                value0: result.summary.importedCookies,
                value1: browser?.label ?? browserFamily,
                value2: browserProfile
              }
            )
          : translate(
              'auto.components.browser.pane.BrowserToolbarMenu.d6a1f5e4c3b2',
              'Imported {{value0}} cookies from {{value1}}.',
              {
                value0: result.summary.importedCookies,
                value1: browser?.label ?? browserFamily
              }
            ),
        result
      )
    } else {
      toast.error(result.reason)
    }
    return result
  }

  const handleImportFromFile = async (
    filePath?: string
  ): Promise<BrowserCookieImportExecutionResult> => {
    const result = await importCookiesToProfile(effectiveProfileId, filePath)
    if (result.ok) {
      emitBrowserCookieImportToast(
        result.summary,
        translate(
          'auto.components.browser.pane.BrowserToolbarMenu.53bbe3dab4',
          'Imported {{value0}} cookies from file.',
          { value0: result.summary.importedCookies }
        ),
        result
      )
    } else if (result.reason !== 'canceled') {
      toast.error(result.reason)
    }
    return result
  }

  return { handleImportFromBrowser, handleImportFromFile }
}
