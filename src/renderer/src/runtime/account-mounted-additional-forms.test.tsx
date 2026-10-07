// @vitest-environment happy-dom
import { useState } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MiniMaxCredentials } from '../components/settings/accounts-pane-minimax-credentials'
import { ZcodePlanAccountsSection } from '../components/settings/ZcodePlanAccountsSection'
import { AgentStep } from '../components/onboarding/AgentStep'
import type { AccountsPaneSectionModel } from '../components/settings/accounts-pane-types'
import { TooltipProvider } from '../components/ui/tooltip'
import { applyMountedAccountsViewerAction } from './account-mounted-viewer-actions'

vi.mock('../store', () => ({
  useAppStore: (
    select: (state: {
      settings: null
      settingsSearchQuery: string
      rateLimits: { zcode: null }
      updateSettings: () => void
      refreshRateLimits: () => void
      recordFeatureInteraction: () => void
    }) => unknown
  ) =>
    select({
      settings: null,
      settingsSearchQuery: '',
      rateLimits: { zcode: null },
      updateSettings: vi.fn(),
      refreshRateLimits: vi.fn(),
      recordFeatureInteraction: vi.fn()
    })
}))
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('updates both MiniMax drafts and the GLM draft without invoking credential persistence', async () => {
  const save = vi.fn()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      zcodePlanCredentials: {
        getStatus: vi.fn(async () => ({ apiKeyConfigured: false, zcodeCliConfigured: false })),
        saveApiKey: save
      }
    }
  })
  function MiniMaxForm() {
    const [miniMaxCookieDraft, setMiniMaxCookieDraft] = useState('')
    const [miniMaxApiKeyDraft, setMiniMaxApiKeyDraft] = useState('')
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: MiniMaxCredentials reads only these declared credential fields; account snapshots and mutations are unavailable in this fixture.
    const model = {
      miniMaxCookieDraft,
      setMiniMaxCookieDraft,
      miniMaxApiKeyDraft,
      setMiniMaxApiKeyDraft,
      miniMaxConfigured: false,
      miniMaxApiKeyConfigured: false,
      miniMaxCookieProtection: null,
      miniMaxApiKeyProtection: null,
      miniMaxCredentialBusy: false,
      miniMaxRateLimits: null,
      saveMiniMaxCookie: save,
      clearMiniMaxCookie: save,
      saveMiniMaxApiKey: save,
      clearMiniMaxApiKey: save
    } as unknown as AccountsPaneSectionModel
    return <MiniMaxCredentials model={model} consoleUrl="https://fixture.invalid" />
  }
  render(
    <>
      <MiniMaxForm />
      <ZcodePlanAccountsSection />
    </>
  )
  await act(async () => {
    await applyMountedAccountsViewerAction({
      type: 'account-minimax-draft',
      field: 'cookie',
      value: 'private-cookie-draft'
    })
    await applyMountedAccountsViewerAction({
      type: 'account-minimax-draft',
      field: 'api-key',
      value: 'private-minimax-draft'
    })
    await applyMountedAccountsViewerAction({
      type: 'account-zcode-plan-draft',
      value: 'private-glm-draft'
    })
  })
  const cookie = document.getElementById('minimax-cookie')
  const key = document.getElementById('minimax-api-key')
  const glm = document.getElementById('zcode-plan-api-key')
  if (
    !(cookie instanceof HTMLInputElement) ||
    !(key instanceof HTMLInputElement) ||
    !(glm instanceof HTMLInputElement)
  ) {
    throw new Error('Missing fixture credential inputs')
  }
  expect(cookie.value).toBe('private-cookie-draft')
  expect(key.value).toBe('private-minimax-draft')
  expect(glm.value).toBe('private-glm-draft')
  expect(save).not.toHaveBeenCalled()
  cleanup()
  await expect(
    applyMountedAccountsViewerAction({ type: 'account-minimax-draft', field: 'cookie', value: '' })
  ).rejects.toThrow('unavailable')
  await expect(
    applyMountedAccountsViewerAction({ type: 'account-zcode-plan-draft', value: '' })
  ).rejects.toThrow('unavailable')
})

it('changes only the mounted onboarding permission draft through its existing callback', async () => {
  const persist = vi.fn()
  function Step() {
    const [enabled, setEnabled] = useState(true)
    return (
      <TooltipProvider>
        <AgentStep
          selectedAgent={null}
          onSelect={persist}
          detectedSet={new Set()}
          isDetecting={false}
          yoloPermissions={enabled}
          onYoloPermissionsChange={setEnabled}
        />
      </TooltipProvider>
    )
  }
  const view = render(<Step />)
  expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true')
  await act(async () => {
    await applyMountedAccountsViewerAction({
      type: 'account-onboarding-yolo-draft',
      enabled: false
    })
  })
  expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false')
  expect(persist).not.toHaveBeenCalled()
  view.unmount()
  await expect(
    applyMountedAccountsViewerAction({ type: 'account-onboarding-yolo-draft', enabled: true })
  ).rejects.toThrow('unavailable')
})
