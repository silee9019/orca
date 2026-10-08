// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { PluginHostListEntry } from '../../../../preload/api-types'
import { getDefaultSettings } from '../../../../shared/constants'
import { PluginSettingsViewerActionSchema } from '../../../../shared/plugin-settings-viewer-command'
import { applyPluginSettingsViewerAction } from '@/runtime/plugin-settings-viewer-controller'
import { PluginsSettingsSection } from './PluginsSettingsSection'

vi.mock('./SettingsSection', () => ({
  SettingsSection: ({
    children,
    headerAction
  }: {
    children: React.ReactNode
    headerAction: React.ReactNode
  }) => (
    <section>
      {headerAction}
      {children}
    </section>
  )
}))
vi.mock('./PluginMarketplaceBrowser', () => ({
  PluginMarketplaceBrowser: ({
    renderInstalledContent
  }: {
    renderInstalledContent?: (search: string) => React.ReactNode
  }) => <>{renderInstalledContent?.('')}</>
}))
const plugin: PluginHostListEntry = {
  pluginKey: 'fixture.notes',
  consentFingerprint: 'reviewed-notes',
  name: 'Notes',
  version: '1.0.0',
  publisher: 'fixture',
  status: 'pending',
  needsReconsent: true,
  isDev: false,
  official: false,
  bundled: false,
  capabilities: [],
  panels: [],
  commands: [],
  hasWorker: false,
  restarts: 0
}
let changed: () => void = () => undefined
const api = {
  list: vi.fn(),
  onChanged: vi.fn((listener: () => void) => {
    changed = listener
    return () => undefined
  }),
  consent: vi.fn()
}
beforeEach(() => {
  vi.clearAllMocks()
  changed = () => undefined
  api.list.mockResolvedValue([plugin])
  api.consent.mockReset().mockResolvedValue([{ ...plugin, status: 'idle', needsReconsent: false }])
  Object.defineProperty(window, 'api', { configurable: true, value: { plugins: api } })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'api')
})
async function apply(action: unknown) {
  let request: ReturnType<typeof applyPluginSettingsViewerAction> | undefined
  await act(async () => {
    request = applyPluginSettingsViewerAction(PluginSettingsViewerActionSchema.parse(action))
    void request.catch(() => undefined)
  })
  return request
}
async function mountReview() {
  let view: ReturnType<typeof render> | undefined
  await act(async () => {
    view = render(
      <PluginsSettingsSection
        mounted
        settings={{ ...getDefaultSettings('/fixture'), pluginSystemEnabled: true }}
        updateSettings={async () => undefined}
      />
    )
  })
  if (!view) {
    throw new Error('fixture not mounted')
  }
  await apply({ kind: 'open-plugin', dialog: 'review', pluginKey: plugin.pluginKey })
  return view
}
const get = { kind: 'consent-form', action: { kind: 'get' } }
const decide = (decision: 'approve' | 'keep-disabled', reviewedFingerprint = 'reviewed-notes') => ({
  kind: 'consent-form',
  action: { kind: 'decide', pluginKey: plugin.pluginKey, reviewedFingerprint, decision }
})
it.each(['approve', 'keep-disabled'] as const)(
  'commits the pinned %s decision after the existing dialog closes',
  async (decision) => {
    await mountReview()
    await expect(apply(get)).resolves.toMatchObject({
      consent: { plugin: { consentFingerprint: 'reviewed-notes' }, busyDecision: null }
    })
    await expect(apply(decide(decision))).resolves.toMatchObject({
      consentPluginId: null,
      consent: { accepted: true, decision }
    })
    expect(api.consent).toHaveBeenCalledExactlyOnceWith({
      pluginKey: plugin.pluginKey,
      reviewedFingerprint: 'reviewed-notes',
      decision
    })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  }
)
it('keeps the reviewed fingerprint pinned across list refreshes and preserves declined consent', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  await mountReview()
  api.list.mockResolvedValue([{ ...plugin, version: '2.0.0', consentFingerprint: 'new-review' }])
  await act(async () => {
    changed()
  })
  await expect(apply(get)).resolves.toMatchObject({
    consent: { plugin: { version: '1.0.0', consentFingerprint: 'reviewed-notes' } }
  })
  await expect(apply(decide('approve', 'new-review'))).rejects.toThrow(
    'plugin_consent_fingerprint_changed'
  )
  expect(api.consent).not.toHaveBeenCalled()
  api.consent.mockRejectedValueOnce(new Error('consent-stale'))
  await expect(apply(decide('approve'))).rejects.toThrow('plugin_consent_failed')
  expect(api.consent).toHaveBeenCalledExactlyOnceWith({
    pluginKey: plugin.pluginKey,
    reviewedFingerprint: 'reviewed-notes',
    decision: 'approve'
  })
  await expect(apply(get)).resolves.toMatchObject({ consent: { error: expect.any(String) } })
  expect(screen.getByRole('dialog')).toBeTruthy()
})
it('exposes the actual busy decision and rejects acknowledgements after its settings pane unmounts', async () => {
  let finish: (plugins: PluginHostListEntry[]) => void = () => undefined
  api.consent.mockImplementationOnce(
    () =>
      new Promise<PluginHostListEntry[]>((resolve) => {
        finish = resolve
      })
  )
  const view = await mountReview()
  let request: ReturnType<typeof applyPluginSettingsViewerAction> | undefined
  await act(async () => {
    request = applyPluginSettingsViewerAction(
      PluginSettingsViewerActionSchema.parse(decide('approve'))
    )
    void request.catch(() => undefined)
  })
  await expect(apply(get)).resolves.toMatchObject({ consent: { busyDecision: 'approve' } })
  await expect(apply(decide('keep-disabled'))).rejects.toThrow('viewer_busy')
  await act(async () => {
    view.unmount()
  })
  await expect(request).rejects.toThrow('viewer_unmounted')
  await act(async () => {
    finish([{ ...plugin, status: 'idle', needsReconsent: false }])
  })
  await expect(applyPluginSettingsViewerAction({ kind: 'get' })).rejects.toThrow(
    'viewer_unavailable'
  )
})
