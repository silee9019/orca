import { act } from 'react'
import { expect, vi } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PluginHostListEntry } from '../../src/preload/api-types'
import { useAppStore } from '../../src/renderer/src/store'
import {
  configureMarketplaceInstallFixture,
  fixtureMarketplaceInstalled
} from './plugin-marketplace-preview-story.fixture'

type InvokeMarketplace = (
  action: string,
  value?: string,
  target?: { source: string; plugin: string; review?: string[] }
) => Promise<void>
export async function verifyMarketplaceInstall(
  invoke: InvokeMarketplace,
  source: string,
  directory: string,
  remount: () => Promise<void>
): Promise<void> {
  const target = {
    source,
    plugin: 'fixture.alpha',
    review: [
      '--confirm',
      'fixture.alpha',
      '--content-hash',
      'd'.repeat(64),
      '--consent-fingerprint',
      'e'.repeat(64),
      '--marketplace-commit',
      'b'.repeat(40),
      '--resolved-commit',
      'c'.repeat(40)
    ]
  }
  const identity = {
    marketplaceSourceId: source,
    pluginKey: target.plugin,
    marketplaceCommit: 'b'.repeat(40),
    resolvedCommit: 'c'.repeat(40)
  }
  const installed: PluginHostListEntry = {
    pluginKey: target.plugin,
    consentFingerprint: 'e'.repeat(64),
    name: 'Fixture review',
    version: '1.0.0',
    publisher: 'fixture',
    status: 'pending',
    needsReconsent: true,
    isDev: false,
    official: false,
    bundled: false,
    capabilities: [{ kind: 'workspace:read', description: 'Fixture read access' }],
    panels: [],
    commands: [],
    hasWorker: true,
    restarts: 0,
    source: {
      kind: 'marketplace',
      reference: 'https://example.invalid/catalog.git',
      resolvedCommit: identity.resolvedCommit,
      contentHash: 'd'.repeat(64),
      marketplace: {
        reference: 'https://example.invalid/catalog.git',
        resolvedCommit: identity.marketplaceCommit
      }
    }
  }
  const installedFile = join(directory, 'fake-installed-content.txt')
  let providerInstalled = false
  let calls = 0
  let wrongListSource = false
  let failList = false
  let failInstall = false
  let wrongIdentity = false
  let releaseInstall: (() => void) | undefined
  let holdInstall = false
  configureMarketplaceInstallFixture(
    async (request) => {
      calls++
      expect(request).toEqual(identity)
      if (holdInstall) {
        await new Promise<void>((resolve) => {
          releaseInstall = resolve
        })
      }
      if (failInstall) {
        return { ok: false, error: 'private-provider-error' }
      }
      providerInstalled = true
      writeFileSync(installedFile, installed.source?.contentHash ?? '')
      fixtureMarketplaceInstalled([installed])
      return {
        ok: true,
        pluginKey: wrongIdentity ? 'fixture.other' : target.plugin,
        version: installed.version,
        contentHash: installed.source?.contentHash ?? '',
        consentFingerprint: installed.consentFingerprint ?? '',
        resolvedCommit: identity.resolvedCommit
      }
    },
    async () => {
      if (failList) {
        throw new Error('private-parent-scan-error')
      }
      return providerInstalled
        ? [
            {
              ...installed,
              source: installed.source
                ? {
                    ...installed.source,
                    reference: wrongListSource
                      ? 'https://example.invalid/wrong-plugin.git'
                      : installed.source.reference
                  }
                : undefined
            }
          ]
        : []
    }
  )
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    // Parent read-back is injected only after the authoritative mutation, so initial review stays uninstalled.
    await invoke('preview', undefined, target)
    expect(vi.mocked(console.log).mock.calls.at(-1)?.[0]).toContain('d'.repeat(64))
    expect(vi.mocked(console.log).mock.calls.at(-1)?.[0]).not.toContain('https://')
    await expect(
      invoke('install-preview', undefined, {
        ...target,
        review: target.review.map((v) => (v === 'd'.repeat(64) ? 'f'.repeat(64) : v))
      })
    ).rejects.toThrow('plugin_marketplace_review_identity_mismatch')
    await expect(
      invoke('install-preview', undefined, {
        ...target,
        review: ['--confirm', 'fixture.other', ...target.review.slice(2)]
      })
    ).rejects.toThrow('plugin_marketplace_review_identity_mismatch')
    expect(calls).toBe(0)
    failInstall = true
    await expect(invoke('install-preview', undefined, target)).rejects.toThrow(
      'plugin_marketplace_install_failed_effect_unknown'
    )
    expect(calls).toBe(1)
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Install plugin')
    failInstall = false
    wrongIdentity = true
    await expect(invoke('install-preview', undefined, target)).rejects.toThrow(
      'plugin_marketplace_install_failed_effect_unknown'
    )
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Install plugin')
    wrongIdentity = false
    holdInstall = true
    const late = invoke('install-preview', undefined, target)
    await vi.waitFor(() => expect(releaseInstall).toBeTypeOf('function'))
    await act(async () => {
      useAppStore.setState({ activeModal: 'quick-open' })
      releaseInstall?.()
    })
    await expect(late).rejects.toThrow('plugin_marketplace_install_failed_effect_unknown')
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Install plugin')
    await act(async () => useAppStore.setState({ activeModal: 'none' }))
    holdInstall = false
    failList = true
    await expect(invoke('install-preview', undefined, target)).rejects.toThrow(
      'plugin_marketplace_install_failed_effect_unknown'
    )
    expect(readFileSync(installedFile, 'utf8')).toBe('d'.repeat(64))
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    failList = false
    providerInstalled = false
    fixtureMarketplaceInstalled([])
    await remount()
    wrongListSource = true
    await invoke('preview', undefined, target)
    await expect(invoke('install-preview', undefined, target)).rejects.toThrow(
      'plugin_marketplace_install_failed_effect_unknown'
    )
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Review permissions')
    wrongListSource = false
    providerInstalled = false
    fixtureMarketplaceInstalled([])
    await remount()
    await invoke('preview', undefined, target)
    await invoke('install-preview', undefined, target)
    expect(readFileSync(installedFile, 'utf8')).toBe('d'.repeat(64))
    const consent = document.querySelector('[role="dialog"]')
    expect(consent?.textContent).toContain('Review permissions')
    expect(consent?.textContent).toContain('normal process')
    expect(consent?.textContent).toContain('Keep Disabled')
    expect(consent?.textContent).toContain('Enable plugin')
    expect(installed.status).toBe('pending')
    expect(installed.needsReconsent).toBe(true)
    const stdout = JSON.stringify(vi.mocked(console.log).mock.calls)
    expect(stdout).not.toContain('private-provider-error')
    expect(stdout).not.toContain('private-parent-scan-error')
    expect(stdout).not.toContain('https://example.invalid')
  } finally {
    releaseInstall?.()
    configureMarketplaceInstallFixture()
    fixtureMarketplaceInstalled([])
    warn.mockRestore()
  }
}
