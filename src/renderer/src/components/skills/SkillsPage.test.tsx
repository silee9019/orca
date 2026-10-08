// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SkillsViewerAction } from '../../../../shared/skills-viewer-command'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { DiscoveredSkill, SkillDiscoveryResult } from '../../../../shared/skills'
import { createCompatibleRuntimeStatusResponseIfNeeded } from '@/runtime/runtime-compatibility-test-fixture'
import { clearRuntimeCompatibilityCacheForTests } from '@/runtime/runtime-rpc-client'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConfirmationDialogProvider } from '@/components/confirmation-dialog'
import { useAppStore } from '@/store'
import SkillsPage from './SkillsPage'
import { applySkillsViewerAction } from '../../runtime/skills-viewer-controller'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null

function skill(name: string, overrides: Partial<DiscoveredSkill> = {}): DiscoveredSkill {
  return {
    id: `skill-${name}`,
    name,
    description: null,
    providers: ['agent-skills'],
    sourceKind: 'home',
    sourceLabel: 'Agent skills home',
    rootPath: `/home/dev/.agents/skills`,
    directoryPath: `/home/dev/.agents/skills/${name}`,
    skillFilePath: `/home/dev/.agents/skills/${name}/SKILL.md`,
    installed: true,
    updatedAt: null,
    ...overrides
  }
}

function discoveryResult(names: string[]): SkillDiscoveryResult {
  return { skills: names.map((name) => skill(name)), sources: [], scannedAt: 1 }
}

function skillsApi(discover: ReturnType<typeof vi.fn>) {
  return {
    discover,
    deleteSupported: () => Promise.resolve(true),
    onInstallProgress: () => () => undefined
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function setRuntimeOwner(environmentId: string | null): void {
  useAppStore.setState({
    settings: { activeRuntimeEnvironmentId: environmentId } as GlobalSettings,
    runtimeEnvironments: (environmentId ? [{ id: environmentId }] : []) as never,
    runtimeEnvironmentCatalogSettled: true
  })
}

async function renderPage(): Promise<void> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(
      <TooltipProvider>
        <ConfirmationDialogProvider>
          <SkillsPage />
        </ConfirmationDialogProvider>
      </TooltipProvider>
    )
  })
}

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 8; tick += 1) {
      await Promise.resolve()
    }
  })
}

/** Skill names currently rendered as rows. */
function renderedSkillNames(): string[] {
  return [...(container?.querySelectorAll('[data-skill-name]') ?? [])].map(
    (node) => node.textContent ?? ''
  )
}

function buttonNamed(name: string): HTMLButtonElement {
  const button = [...(container?.querySelectorAll('button') ?? [])].find(
    (candidate) =>
      candidate.textContent?.trim() === name || candidate.getAttribute('aria-label') === name
  )
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Missing button: ${name}`)
  }
  return button
}

function buttonStartingWith(prefix: string): HTMLButtonElement {
  const button = [...(container?.querySelectorAll('button') ?? [])].find((candidate) =>
    candidate.textContent?.trim().startsWith(prefix)
  )
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Missing button starting with: ${prefix}`)
  }
  return button
}

function skillRow(name: string): HTMLElement {
  const row = [...(container?.querySelectorAll('[role="option"]') ?? [])].find(
    (candidate) => candidate.querySelector('[data-skill-name]')?.textContent === name
  )
  if (!(row instanceof HTMLElement)) {
    throw new Error(`Missing skill row: ${name}`)
  }
  return row
}

function selectionCheckbox(name: string): HTMLButtonElement {
  const checkbox = container?.querySelector(`[aria-label="Select ${name}"]`)
  if (!(checkbox instanceof HTMLButtonElement)) {
    throw new Error(`Missing selection checkbox: ${name}`)
  }
  return checkbox
}

beforeEach(() => {
  setRuntimeOwner(null)
})

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount()
    })
  }
  root = null
  container?.remove()
  container = null
  clearRuntimeCompatibilityCacheForTests()
  useAppStore.setState({
    settings: null,
    runtimeEnvironments: [],
    runtimeEnvironmentCatalogSettled: false
  })
  vi.restoreAllMocks()
  Reflect.deleteProperty(window, 'api')
})

describe('SkillsPage', () => {
  it('uses the public viewer for empty installs, failed scan retries and no-match resets', async () => {
    const discover = vi
      .fn()
      .mockResolvedValueOnce(discoveryResult([]))
      .mockRejectedValueOnce(new Error('fixture unavailable'))
      .mockResolvedValue(discoveryResult(['alpha']))
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { skills: skillsApi(discover), runtimeEnvironments: { call: vi.fn() } }
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await renderPage()
    await flushMicrotasks()
    async function apply(action: SkillsViewerAction) {
      let pending: ReturnType<typeof applySkillsViewerAction> | undefined
      await act(async () => {
        pending = applySkillsViewerAction(action)
        void pending.catch(() => undefined)
      })
      return pending
    }
    expect(container?.textContent).toContain('No skills found')
    await expect(apply({ kind: 'install', open: true })).resolves.toMatchObject({
      installOpen: true
    })
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    await apply({ kind: 'install', open: false })
    await expect(apply({ kind: 'refresh' })).rejects.toThrow('skills_refresh_failed')
    expect(container?.textContent).toContain('Could not scan skills')
    await expect(apply({ kind: 'refresh' })).resolves.toMatchObject({
      error: false,
      visibleSkillIds: ['skill-alpha']
    })
    expect(container?.textContent).not.toContain('Could not scan skills')
    await apply({ kind: 'filter', value: { query: 'missing', sourceKind: 'all', agent: 'all' } })
    expect(container?.textContent).toContain('No matches')
    await apply({ kind: 'filter-clear' })
    expect(renderedSkillNames()).toEqual(['alpha'])
    expect(discover).toHaveBeenCalledTimes(3)
  })

  it('acknowledges viewer filtering and eligible share selection on the owning page', async () => {
    const discover = vi.fn().mockResolvedValue(discoveryResult(['alpha', 'beta']))
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { skills: skillsApi(discover), runtimeEnvironments: { call: vi.fn() } }
    })
    await renderPage()
    await flushMicrotasks()
    let request: ReturnType<typeof applySkillsViewerAction> | undefined
    await act(async () => {
      request = applySkillsViewerAction({
        kind: 'filter',
        value: { query: 'beta', sourceKind: 'all', agent: 'all' }
      })
    })
    await expect(request).resolves.toMatchObject({
      visibleSkillIds: ['skill-beta'],
      committed: true
    })
    expect(renderedSkillNames()).toEqual(['beta'])
    await act(async () => {
      request = applySkillsViewerAction({ kind: 'mode', value: 'share' })
    })
    await request
    await act(async () => {
      request = applySkillsViewerAction({ kind: 'select', ids: ['skill-beta'], selected: true })
    })
    await expect(request).resolves.toMatchObject({
      selectedSkillIds: ['skill-beta'],
      selectionMode: 'share'
    })
    expect(selectionCheckbox('beta').getAttribute('aria-checked')).toBe('true')
    await act(async () => {
      request = applySkillsViewerAction({ kind: 'filter-clear' })
    })
    await request
    expect(renderedSkillNames()).toEqual(['alpha', 'beta'])
    await act(async () => {
      request = applySkillsViewerAction({ kind: 'mode', value: null })
    })
    await expect(request).resolves.toMatchObject({ selectionMode: null, selectedSkillIds: [] })
    await act(async () => {
      request = applySkillsViewerAction({ kind: 'mode', value: 'delete' })
    })
    await request
    await act(async () => {
      request = applySkillsViewerAction({ kind: 'select-visible' })
    })
    await expect(request).resolves.toMatchObject({
      selectionMode: 'delete',
      selectedSkillIds: ['skill-alpha', 'skill-beta']
    })
    await act(async () => {
      request = applySkillsViewerAction({ kind: 'clear-selection' })
    })
    await expect(request).resolves.toMatchObject({ selectedSkillIds: [] })
  })

  it('rejects ineligible and missing selection without a partial state update', async () => {
    const discover = vi.fn().mockResolvedValue({
      skills: [skill('alpha'), skill('protected', { sourceKind: 'bundled' })],
      sources: [],
      scannedAt: 1
    } satisfies SkillDiscoveryResult)
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { skills: skillsApi(discover), runtimeEnvironments: { call: vi.fn() } }
    })
    await renderPage()
    await flushMicrotasks()
    let request: ReturnType<typeof applySkillsViewerAction> | undefined
    await act(async () => {
      request = applySkillsViewerAction({ kind: 'mode', value: 'share' })
    })
    await request
    await expect(
      applySkillsViewerAction({
        kind: 'select',
        ids: ['skill-alpha', 'skill-protected'],
        selected: true
      })
    ).rejects.toThrow('skill_selection_ineligible')
    await expect(
      applySkillsViewerAction({ kind: 'select', ids: ['missing'], selected: true })
    ).rejects.toThrow('skill_not_visible')
    await expect(applySkillsViewerAction({ kind: 'get' })).resolves.toMatchObject({
      selectedSkillIds: []
    })
  })

  it('rejects a pending viewer refresh when the owning runtime changes', async () => {
    const late = deferred<SkillDiscoveryResult>()
    const discover = vi
      .fn()
      .mockResolvedValueOnce(discoveryResult(['alpha']))
      .mockReturnValueOnce(late.promise)
    const call = vi.fn(
      async (args: { method: string; selector?: string }) =>
        createCompatibleRuntimeStatusResponseIfNeeded(args) ?? {
          id: 'skills',
          ok: true,
          result: discoveryResult(['remote-only'])
        }
    )
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { skills: skillsApi(discover), runtimeEnvironments: { call } }
    })
    await renderPage()
    await flushMicrotasks()
    let request: ReturnType<typeof applySkillsViewerAction> | undefined
    await act(async () => {
      request = applySkillsViewerAction({ kind: 'refresh' })
      request.catch(() => {})
    })
    await act(async () => {
      setRuntimeOwner('env-1')
    })
    await expect(request).rejects.toThrow('viewer_target_changed')
    late.resolve(discoveryResult(['stale-local']))
    await flushMicrotasks()
    expect(renderedSkillNames()).toEqual(['remote-only'])
  })

  it('commits shared-view resets and opens and closes the existing install dialogs', async () => {
    const discover = vi.fn().mockResolvedValue(discoveryResult(['alpha']))
    const share = (id: string) => ({
      id,
      url: `https://example.invalid/skills/${id}`,
      packageId: `package-${id}`,
      name: `Share ${id}`,
      description: '',
      createdAt: '2026-10-08T00:00:00Z'
    })
    const listOwnedShares = vi
      .fn()
      .mockResolvedValueOnce({ status: 'ok', value: [share('alpha'), share('beta')] })
      .mockResolvedValue({ status: 'ok', value: [share('gamma')] })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        skills: {
          ...skillsApi(discover),
          listOwnedShares,
          listManagedInstalls: async () => ({ status: 'ok', value: [] })
        },
        runtimeEnvironments: { call: vi.fn() }
      }
    })
    await renderPage()
    await flushMicrotasks()
    let request: ReturnType<typeof applySkillsViewerAction> | undefined
    await act(async () => {
      request = applySkillsViewerAction({
        kind: 'filter',
        value: { query: 'alpha', sourceKind: 'all', agent: 'all' }
      })
    })
    await request
    await act(async () => {
      request = applySkillsViewerAction({ kind: 'view', value: 'shared' })
    })
    await expect(request).resolves.toMatchObject({ view: 'shared', filters: { query: '' } })
    expect(renderedSkillNames()).toEqual([])
    await expect(applySkillsViewerAction({ kind: 'get' })).resolves.toMatchObject({
      visibleSkillIds: [],
      visibleShareIds: ['alpha', 'beta']
    })
    await act(async () => {
      request = applySkillsViewerAction({
        kind: 'filter',
        value: { query: 'beta', sourceKind: 'all', agent: 'all' }
      })
    })
    await expect(request).resolves.toMatchObject({ visibleShareIds: ['beta'] })
    expect(container?.textContent).not.toContain('Share alpha')
    expect(container?.textContent).toContain('Share beta')
    await act(async () => {
      request = applySkillsViewerAction({ kind: 'refresh' })
      request.catch(() => {})
    })
    await expect(request).resolves.toMatchObject({
      visibleShareIds: [],
      loading: false,
      error: false
    })
    expect(listOwnedShares).toHaveBeenCalledTimes(2)
    await act(async () => {
      request = applySkillsViewerAction({ kind: 'filter-clear' })
    })
    await expect(request).resolves.toMatchObject({ visibleShareIds: ['gamma'] })
    expect(container?.textContent).toContain('Share gamma')
    await act(async () => {
      request = applySkillsViewerAction({ kind: 'view', value: 'skills' })
    })
    await expect(request).resolves.toMatchObject({ view: 'skills', filters: { query: '' } })
    expect(renderedSkillNames()).toEqual(['alpha'])
    await act(async () => {
      request = applySkillsViewerAction({ kind: 'management', open: true })
    })
    await expect(request).resolves.toMatchObject({ managementOpen: true })
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    await act(async () => {
      request = applySkillsViewerAction({ kind: 'management', open: false })
    })
    await expect(request).resolves.toMatchObject({ managementOpen: false })
    await act(async () => {
      request = applySkillsViewerAction({ kind: 'install', open: true })
    })
    await expect(request).resolves.toMatchObject({ installOpen: true })
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    await act(async () => {
      request = applySkillsViewerAction({
        kind: 'install-form',
        action: { kind: 'link', value: 'share-fixture' }
      })
    })
    await expect(request).resolves.toMatchObject({
      install: { committed: true, link: 'share-fixture' }
    })
    await act(async () => {
      request = applySkillsViewerAction({ kind: 'install', open: false })
    })
    await expect(request).resolves.toMatchObject({ installOpen: false })
  })

  it('keeps a busy managed-install dialog open and closes through its reset path', async () => {
    const discover = vi.fn().mockResolvedValue(discoveryResult(['alpha']))
    const listing = deferred<{ status: 'ok'; value: [] }>()
    const listManagedInstalls = vi.fn().mockReturnValue(listing.promise)
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        skills: { ...skillsApi(discover), listManagedInstalls },
        runtimeEnvironments: { call: vi.fn() }
      }
    })
    await renderPage()
    let request: ReturnType<typeof applySkillsViewerAction> | undefined
    await act(async () => {
      request = applySkillsViewerAction({ kind: 'management', open: true })
    })
    await request
    expect(listManagedInstalls).toHaveBeenCalledTimes(1)
    await expect(applySkillsViewerAction({ kind: 'management', open: false })).rejects.toThrow(
      'viewer_busy'
    )
    await expect(applySkillsViewerAction({ kind: 'install', open: true })).rejects.toThrow(
      'viewer_modal_open'
    )
    await expect(applySkillsViewerAction({ kind: 'get' })).resolves.toMatchObject({
      managementOpen: true
    })
    await act(async () => {
      listing.resolve({ status: 'ok', value: [] })
    })
    await act(async () => {
      request = applySkillsViewerAction({ kind: 'management', open: false })
    })
    await expect(request).resolves.toMatchObject({ managementOpen: false })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    await act(async () => {
      request = applySkillsViewerAction({ kind: 'management', open: true })
    })
    await expect(request).resolves.toMatchObject({ managementOpen: true })
    expect(listManagedInstalls).toHaveBeenCalledTimes(2)
    await act(async () => {
      request = applySkillsViewerAction({ kind: 'management', open: false })
    })
    await request
    await act(async () => {
      request = applySkillsViewerAction({ kind: 'install', open: true })
    })
    await request
    await expect(
      applySkillsViewerAction({ kind: 'install', open: true, link: 'replacement' })
    ).rejects.toThrow('viewer_modal_open')
    await act(async () => {
      request = applySkillsViewerAction({ kind: 'install', open: false })
    })
    await expect(request).resolves.toMatchObject({ installOpen: false })
  })

  it('uses platform-neutral Escape navigation without stealing editable input Escape', async () => {
    const closeSkillsPage = vi.fn()
    const discover = vi.fn().mockResolvedValue(discoveryResult(['alpha']))
    useAppStore.setState({ closeSkillsPage })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { skills: skillsApi(discover), runtimeEnvironments: { call: vi.fn() } }
    })
    await renderPage()
    await flushMicrotasks()

    const search = container?.querySelector('input[placeholder="Search skills"]')
    if (!(search instanceof HTMLInputElement)) {
      throw new Error('Missing skill search')
    }
    await act(async () => {
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(closeSkillsPage).not.toHaveBeenCalled()

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(closeSkillsPage).toHaveBeenCalledOnce()
  })

  it('contains long cross-platform skill paths while preserving the full path', async () => {
    const longPath = `C:\\Users\\orca\\${'nested-folder\\'.repeat(30)}SKILL.md`
    const discover = vi.fn().mockResolvedValue({
      skills: [skill('long-path', { skillFilePath: longPath })],
      sources: [],
      scannedAt: 1
    } satisfies SkillDiscoveryResult)
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { skills: skillsApi(discover), runtimeEnvironments: { call: vi.fn() } }
    })

    await renderPage()
    await flushMicrotasks()
    // Why: the path lives in the detail dialog, where it must wrap inside the
    // column instead of pushing the dialog into horizontal scroll.
    await act(async () => fireEvent.click(skillRow('long-path')))

    const dialog = document.querySelector('[role="dialog"]')
    const path = [...(dialog?.querySelectorAll('*') ?? [])].find(
      (element) => element.textContent === longPath && element.children.length === 0
    )
    expect(path?.classList.contains('break-all')).toBe(true)
    expect(path?.textContent).toBe(longPath)
  })

  it('scans the connected remote runtime instead of the client disk', async () => {
    const discover = vi.fn().mockResolvedValue(discoveryResult(['local-only']))
    const call = vi.fn(
      async (args: { method: string; selector?: string }) =>
        createCompatibleRuntimeStatusResponseIfNeeded(args) ?? {
          id: 'skills',
          ok: true,
          result: discoveryResult(['remote-only'])
        }
    )
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { skills: skillsApi(discover), runtimeEnvironments: { call } }
    })
    setRuntimeOwner('env-1')

    await renderPage()
    await flushMicrotasks()

    expect(discover).not.toHaveBeenCalled()
    expect(renderedSkillNames()).toContain('remote-only')
  })

  // Why: a cold local scan walks every skill root, so it can land after a newer
  // remote scan. Without a generation guard it overwrites the remote list and
  // the page silently shows the client's skills again — #6789 all over.
  it('does not let a slow local scan overwrite a newer remote scan', async () => {
    const localScan = deferred<SkillDiscoveryResult>()
    const discover = vi.fn().mockReturnValue(localScan.promise)
    const call = vi.fn(
      async (args: { method: string; selector?: string }) =>
        createCompatibleRuntimeStatusResponseIfNeeded(args) ?? {
          id: 'skills',
          ok: true,
          result: discoveryResult(['remote-only'])
        }
    )
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { skills: skillsApi(discover), runtimeEnvironments: { call } }
    })

    await renderPage()
    await act(async () => {
      setRuntimeOwner('env-1')
    })
    await flushMicrotasks()
    expect(renderedSkillNames()).toContain('remote-only')

    localScan.resolve(discoveryResult(['local-only']))
    await flushMicrotasks()

    expect(renderedSkillNames()).toContain('remote-only')
    expect(renderedSkillNames()).not.toContain('local-only')
  })

  it("does not show one runtime's skills when the next runtime scan fails", async () => {
    const discover = vi.fn().mockResolvedValue(discoveryResult(['local-only']))
    const call = vi.fn(async (args: { method: string; selector?: string }) => {
      const compatibilityResponse = createCompatibleRuntimeStatusResponseIfNeeded(args)
      if (compatibilityResponse) {
        return compatibilityResponse
      }
      throw new Error('remote unavailable')
    })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { skills: skillsApi(discover), runtimeEnvironments: { call } }
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await renderPage()
    await flushMicrotasks()
    expect(renderedSkillNames()).toEqual(['local-only'])

    await act(async () => {
      setRuntimeOwner('env-1')
    })
    await flushMicrotasks()

    expect(container?.textContent).toContain('Could not scan skills')
    expect(renderedSkillNames()).toEqual([])
  })

  it('keeps scanning rather than listing client skills before the owner is known', async () => {
    const discover = vi.fn().mockResolvedValue(discoveryResult(['local-only']))
    const call = vi.fn()
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { skills: skillsApi(discover), runtimeEnvironments: { call } }
    })
    useAppStore.setState({ runtimeEnvironmentCatalogSettled: false })

    await renderPage()
    await flushMicrotasks()

    expect(discover).not.toHaveBeenCalled()
    expect(call).not.toHaveBeenCalled()
    expect(container?.textContent).toContain('Scanning skills')
  })

  it('preserves hidden selections when selecting all filtered results', async () => {
    const discover = vi.fn().mockResolvedValue(discoveryResult(['alpha', 'beta']))
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { skills: skillsApi(discover), runtimeEnvironments: { call: vi.fn() } }
    })

    await renderPage()
    await flushMicrotasks()
    await act(async () => fireEvent.click(buttonNamed('Share skills')))
    await act(async () => fireEvent.click(selectionCheckbox('alpha')))

    const search = container?.querySelector('input[placeholder="Search skills"]')
    if (!(search instanceof HTMLInputElement)) {
      throw new Error('Missing skill search')
    }
    await act(async () => fireEvent.input(search, { target: { value: 'beta' } }))
    expect(container?.textContent).toContain('1 selected')

    await act(async () => fireEvent.click(buttonStartingWith('Select all')))
    expect(container?.textContent).toContain('2 selected')
    await act(async () => fireEvent.input(search, { target: { value: '' } }))
    expect(selectionCheckbox('alpha').getAttribute('data-state')).toBe('checked')
    expect(selectionCheckbox('beta').getAttribute('data-state')).toBe('checked')
  })

  it('shows why skills are disabled and selects only one duplicate name', async () => {
    const discover = vi.fn().mockResolvedValue({
      skills: [
        skill('same-name', { id: 'home:same-name' }),
        skill('same-name', { id: 'repo:same-name', sourceKind: 'repo' }),
        skill('bundled-skill', { sourceKind: 'bundled' })
      ],
      sources: [],
      scannedAt: 1
    } satisfies SkillDiscoveryResult)
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { skills: skillsApi(discover), runtimeEnvironments: { call: vi.fn() } }
    })

    await renderPage()
    await flushMicrotasks()
    await act(async () => fireEvent.click(buttonNamed('Share skills')))
    expect(container?.textContent).toContain('Only home and workspace skills can be shared.')

    await act(async () => fireEvent.click(buttonStartingWith('Select all')))
    expect(container?.textContent).toContain('1 selected')
    expect(container?.textContent).toContain(
      'A skill with this name is already selected from another source.'
    )
  })

  // Why: Escape used to leave the page outright, discarding a selection that can
  // hold dozens of skills chosen one by one.
  it('backs out of share selection on Escape before leaving the page', async () => {
    const closeSkillsPage = vi.fn()
    const discover = vi.fn().mockResolvedValue(discoveryResult(['alpha']))
    useAppStore.setState({ closeSkillsPage })
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { skills: skillsApi(discover), runtimeEnvironments: { call: vi.fn() } }
    })

    await renderPage()
    await flushMicrotasks()
    await act(async () => fireEvent.click(buttonNamed('Share skills')))
    expect(container?.querySelector('[aria-label="Select alpha"]')).not.toBeNull()

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(closeSkillsPage).not.toHaveBeenCalled()
    expect(container?.querySelector('[aria-label="Select alpha"]')).toBeNull()

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(closeSkillsPage).toHaveBeenCalledOnce()
  })

  // Why: bundles run to ~30 skills; ticking each box one at a time is the flow
  // this page exists for.
  it('extends the share selection to a shift-clicked row', async () => {
    const discover = vi.fn().mockResolvedValue(discoveryResult(['alpha', 'beta', 'gamma']))
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { skills: skillsApi(discover), runtimeEnvironments: { call: vi.fn() } }
    })

    await renderPage()
    await flushMicrotasks()
    await act(async () => fireEvent.click(buttonNamed('Share skills')))
    await act(async () => fireEvent.click(skillRow('alpha')))
    expect(container?.textContent).toContain('1 selected')

    const gamma = skillRow('gamma')
    await act(async () => {
      fireEvent.pointerDown(gamma, { shiftKey: true })
      fireEvent.click(gamma, { shiftKey: true })
    })
    expect(container?.textContent).toContain('3 selected')
  })

  it('filters by source from the count chips', async () => {
    const discover = vi.fn().mockResolvedValue({
      skills: [skill('home-skill'), skill('plugin-skill', { sourceKind: 'plugin' })],
      sources: [],
      scannedAt: 1
    } satisfies SkillDiscoveryResult)
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { skills: skillsApi(discover), runtimeEnvironments: { call: vi.fn() } }
    })

    await renderPage()
    await flushMicrotasks()
    await act(async () => fireEvent.click(buttonStartingWith('Plugin')))

    expect(renderedSkillNames()).toEqual(['plugin-skill'])
    expect(container?.textContent).toContain('1 result')
  })

  // Why: the reason is per-row state, but on a remote runtime it applies to every
  // row at once — 114 copies of the same sentence is not an explanation.
  it('explains remote-only skills once instead of on every row', async () => {
    const call = vi.fn(
      async (args: { method: string; selector?: string }) =>
        createCompatibleRuntimeStatusResponseIfNeeded(args) ?? {
          id: 'skills',
          ok: true,
          result: discoveryResult(['remote-one', 'remote-two'])
        }
    )
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { skills: skillsApi(vi.fn()), runtimeEnvironments: { call } }
    })
    setRuntimeOwner('env-1')

    await renderPage()
    await flushMicrotasks()
    await act(async () => fireEvent.click(buttonNamed('Share skills')))

    const notices = (container?.textContent ?? '').split('Open Skills on that machine').length - 1
    expect(notices).toBe(1)
    expect(container?.textContent).not.toContain('Open this skill on its owning machine')
  })

  it('drops stale selections when a refreshed scan no longer contains the skill', async () => {
    const discover = vi
      .fn()
      .mockResolvedValueOnce(discoveryResult(['alpha', 'beta']))
      .mockResolvedValueOnce(discoveryResult(['beta']))
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { skills: skillsApi(discover), runtimeEnvironments: { call: vi.fn() } }
    })

    await renderPage()
    await flushMicrotasks()
    await act(async () => fireEvent.click(buttonNamed('Share skills')))
    await act(async () => fireEvent.click(selectionCheckbox('alpha')))
    expect(container?.textContent).toContain('1 selected')

    await act(async () => fireEvent.click(buttonNamed('Refresh')))
    await flushMicrotasks()
    expect(container?.textContent).toContain('0 selected')
    expect(renderedSkillNames()).toEqual(['beta'])
  })
  it('distinguishes a failed scan from empty skill folders', async () => {
    const discover = vi
      .fn()
      .mockRejectedValue(
        new Error(
          "Error invoking remote method 'skills:discover': Error: EACCES: permission denied\nSSH host unavailable"
        )
      )
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { skills: skillsApi(discover), runtimeEnvironments: { call: vi.fn() } }
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await renderPage()
    await flushMicrotasks()

    expect(container?.textContent).toContain('Could not scan skills')
    expect(container?.textContent).toContain('EACCES: permission denied')
    expect(container?.textContent).toContain('SSH host unavailable')
    expect(container?.textContent).not.toContain('Error invoking remote method')
    // Why: nothing was scanned, so "the scanned skill folders are empty" would be a claim we cannot make.
    expect(container?.textContent).not.toContain('No skills found')
  })

  it('retries the failed scan from the error band and clears it on success', async () => {
    const discover = vi
      .fn()
      .mockRejectedValueOnce(new Error('EACCES: permission denied'))
      .mockResolvedValueOnce(discoveryResult(['alpha']))
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { skills: skillsApi(discover), runtimeEnvironments: { call: vi.fn() } }
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await renderPage()
    await flushMicrotasks()
    await act(async () => fireEvent.click(buttonNamed('Retry')))
    await flushMicrotasks()

    expect(container?.textContent).not.toContain('Could not scan skills')
    expect(renderedSkillNames()).toEqual(['alpha'])
  })

  it('keeps a previously confirmed empty result visible when a refresh fails', async () => {
    const discover = vi
      .fn()
      .mockResolvedValueOnce(discoveryResult([]))
      .mockRejectedValueOnce(new Error('host unavailable'))
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: { skills: skillsApi(discover), runtimeEnvironments: { call: vi.fn() } }
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await renderPage()
    await flushMicrotasks()
    expect(container?.textContent).toContain('No skills found')

    await act(async () => fireEvent.click(buttonNamed('Refresh')))
    await flushMicrotasks()

    expect(container?.textContent).toContain('Could not scan skills')
    expect(container?.textContent).toContain('No skills found')
  })
})
