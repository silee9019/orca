import type { ShellApi } from '../../../../preload/api/shell-api'
export async function openBrowserTabExternallyVerified(api: ShellApi, url: string): Promise<void> {
  if (!api.openVerifiedUrl) {
    throw new Error('browser_tab_external_open_unavailable')
  }
  let result: unknown
  try {
    result = await api.openVerifiedUrl(url)
  } catch (error) {
    if (error instanceof Error && error.message === 'external_url_open_unverifiable') {
      throw error
    }
    throw new Error('browser_tab_external_open_failed_effect_unknown')
  }
  if (!result || typeof result !== 'object' || !('opened' in result) || result.opened !== true) {
    throw new Error('external_url_open_unverifiable')
  }
}
