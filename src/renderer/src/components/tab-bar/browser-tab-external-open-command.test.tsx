// @vitest-environment happy-dom
import {
  fixture,
  Owner,
  command,
  resetBrowserTabUiFixture
} from './browser-tab-ui-command-test-fixture'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  clearLiveBrowserUrl,
  rememberLiveBrowserUrl
} from '../browser-pane/describe-page/live-browser-url-registry'
const verified = vi.fn()
const legacy = vi.fn()
let previousApi: PropertyDescriptor | undefined
beforeEach(() => {
  resetBrowserTabUiFixture()
  previousApi = Object.getOwnPropertyDescriptor(window, 'api')
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { shell: { openVerifiedUrl: verified, openUrl: legacy } }
  })
  verified.mockReset().mockResolvedValue({ opened: true })
  clearLiveBrowserUrl('ws-target')
})
afterEach(() => {
  cleanup()
  clearLiveBrowserUrl('ws-target')
  if (previousApi) {
    Object.defineProperty(window, 'api', previousApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
})
it('uses the live sanitized HTTP URL and acknowledges service acceptance without claiming an external window', async () => {
  rememberLiveBrowserUrl('ws-target', 'https://kagi.com/search?q=fixture&token=fixture-token')
  render(<Owner />)
  const result = await command('open-external')
  expect(verified).toHaveBeenCalledWith('https://kagi.com/search?q=fixture')
  expect(result).toMatchObject({
    externalOpenAccepted: true,
    externalWindowVerified: false,
    guestRegistrationVerified: false
  })
  expect(JSON.stringify(result)).not.toContain('fixture-token')
  expect(legacy).not.toHaveBeenCalled()
})
it('refuses unsupported URLs before the service call', async () => {
  fixture.state.browserTabsByWorktree.folder[1].url = 'about:blank'
  render(<Owner />)
  await expect(command('open-external')).rejects.toThrow('browser_tab_external_url_unsupported')
  expect(verified).not.toHaveBeenCalled()
})
it('refuses a missing strict API and an old-peer void response', async () => {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { shell: { openUrl: legacy } }
  })
  render(<Owner />)
  await expect(command('open-external')).rejects.toThrow('browser_tab_external_open_unavailable')
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { shell: { openVerifiedUrl: verified } }
  })
  verified.mockResolvedValue(undefined)
  await expect(command('open-external')).rejects.toThrow('external_url_open_unverifiable')
  expect(legacy).not.toHaveBeenCalled()
})
it('does not expose provider failure details', async () => {
  verified.mockRejectedValue(new Error('provider details'))
  render(<Owner />)
  await expect(command('open-external')).rejects.toThrow(
    'browser_tab_external_open_failed_effect_unknown'
  )
})
