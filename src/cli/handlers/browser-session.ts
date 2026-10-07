import type {
  BrowserDetectProfilesResult,
  BrowserProfileClearDefaultCookiesResult,
  BrowserProfileImportFromBrowserResult
} from '../../shared/runtime-browser-contracts'
import type { BrowserCertificateProceedResult } from '../../shared/browser-workspace-types'
import type { CommandHandler } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { RuntimeClientError } from '../runtime-client'
import { getBrowserCommandTarget } from '../selectors'

function requireConfirmation(flags: Map<string, string | boolean>): void {
  if (flags.get('confirm') !== true) {
    throw new RuntimeClientError('invalid_argument', 'Pass --confirm to approve this operation.')
  }
}

export const BROWSER_SESSION_HANDLERS: Record<string, CommandHandler> = {
  'tab profile import-file': async ({ flags, client, json }) => {
    requireConfirmation(flags)
    const profileId = getRequiredStringFlag(flags, 'profile')
    const filePath = getRequiredStringFlag(flags, 'file')
    const result = await client.call<BrowserProfileImportFromBrowserResult>(
      'browser.profileImportFile',
      { profileId, filePath }
    )
    if (!result.result.ok) {
      throw new RuntimeClientError('runtime_error', result.result.reason)
    }
    printResult(result, json, (value) => JSON.stringify(value, null, 2))
  },
  'tab profile detect-browsers': async ({ client, json }) => {
    const result = await client.call<BrowserDetectProfilesResult>('browser.profileDetectBrowsers')
    printResult(result, json, (value) => JSON.stringify(value, null, 2))
  },
  'tab profile import-browser': async ({ flags, client, json }) => {
    requireConfirmation(flags)
    const profileId = getRequiredStringFlag(flags, 'profile')
    const browserFamily = getRequiredStringFlag(flags, 'browser-family')
    const browserProfile = getOptionalStringFlag(flags, 'browser-profile')
    if (browserProfile && (/[/\\]/.test(browserProfile) || browserProfile.includes('..'))) {
      throw new RuntimeClientError('invalid_argument', 'Invalid browser profile name.')
    }
    const result = await client.call<BrowserProfileImportFromBrowserResult>(
      'browser.profileImportFromBrowser',
      {
        profileId,
        browserFamily,
        ...(browserProfile === undefined ? {} : { browserProfile }),
        supportsPartitionSkippedCookies: true
      }
    )
    if (!result.result.ok) {
      throw new RuntimeClientError('runtime_error', result.result.reason)
    }
    printResult(result, json, (value) => JSON.stringify(value, null, 2))
  },
  'tab profile clear-default-cookies': async ({ flags, client, json }) => {
    requireConfirmation(flags)
    const result = await client.call<BrowserProfileClearDefaultCookiesResult>(
      'browser.profileClearDefaultCookies'
    )
    if (!result.result.cleared) {
      throw new RuntimeClientError('runtime_error', 'Default cookies were not cleared.')
    }
    printResult(result, json, () => 'Default browser cookies cleared.')
  },
  'browser certificate proceed': async ({ flags, client, cwd, json }) => {
    requireConfirmation(flags)
    getRequiredStringFlag(flags, 'page')
    const challengeId = getRequiredStringFlag(flags, 'challenge')
    const target = await getBrowserCommandTarget(flags, cwd, client)
    const result = await client.call<BrowserCertificateProceedResult>(
      'browser.certificate.proceed',
      {
        ...target,
        challengeId
      }
    )
    if (!result.result.ok) {
      throw new RuntimeClientError(
        'runtime_error',
        `Certificate approval refused: ${result.result.reason}`
      )
    }
    printResult(result, json, () => 'Certificate challenge approved.')
  }
}
