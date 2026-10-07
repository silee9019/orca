import { requestVmPaneAction } from '@/runtime/vm-pane-request'
// @vitest-environment happy-dom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EphemeralVmsPane } from './EphemeralVmsPane'

const toastMocks = vi.hoisted(() => ({
  error: vi.fn()
}))

const storeMocks = vi.hoisted(() => ({
  openModal: vi.fn()
}))

const mockStoreState = {
  activeRepoId: null,
  activeWorktreeId: null,
  openModal: storeMocks.openModal,
  recordFeatureInteraction: vi.fn(),
  projects: [],
  repos: [],
  settings: null,
  worktreesByRepo: {}
}

vi.mock('sonner', () => ({
  toast: {
    error: toastMocks.error
  }
}))

vi.mock('@/store', () => ({
  useAppStore: Object.assign((selector: (state: unknown) => unknown) => selector(mockStoreState), {
    getState: () => mockStoreState
  })
}))

const roots: Root[] = []

async function renderPane(): Promise<HTMLDivElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(<EphemeralVmsPane />)
  })
  return container
}

describe('EphemeralVmsPane', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    toastMocks.error.mockClear()
    storeMocks.openModal.mockClear()
    let clipboard = ''
    let pluginChangeListener: ((event: { contentPacksChanged: boolean }) => void) | null = null
    Object.assign(globalThis.window, {
      api: {
        ephemeralVm: {
          listRecipeCatalog: vi.fn().mockResolvedValue([
            {
              repoId: 'repo-1',
              repoName: 'Repo',
              repoPath: '/repo',
              diagnostics: [],
              recipes: [
                {
                  id: 'cloud-sandbox',
                  name: 'Cloud Sandbox',
                  create: './scripts/orca-vm/cloud-sandbox.start.sh',
                  destroy: './scripts/orca-vm/cloud-sandbox.cleanup.sh'
                }
              ]
            }
          ]),
          doctor: vi.fn().mockResolvedValue({
            recipeId: 'cloud-sandbox',
            repoPath: '/repo',
            ok: true,
            checks: []
          })
        },
        skills: {
          discover: vi.fn().mockResolvedValue({ skills: [] })
        },
        cli: {
          getInstallStatus: vi.fn().mockResolvedValue({ state: 'installed', pathConfigured: true }),
          getWslInstallStatus: vi
            .fn()
            .mockResolvedValue({ state: 'installed', pathConfigured: true })
        },
        platform: {
          get: vi.fn().mockReturnValue({ platform: 'darwin' })
        },
        ui: {
          writeClipboardText: vi.fn(async (text: string) => {
            clipboard = text
          }),
          readClipboardText: vi.fn(async () => clipboard)
        },
        plugins: {
          onChanged: vi.fn((listener) => {
            pluginChangeListener = listener
            return () => {
              pluginChangeListener = null
            }
          }),
          emitContentChanged: () => pluginChangeListener?.({ contentPacksChanged: true })
        }
      }
    })
  })

  afterEach(() => {
    roots.splice(0).forEach((root) => {
      act(() => root.unmount())
    })
    document.body.replaceChildren()
  })

  it('refreshes the actual catalog and copied feedback through the typed owner', async () => {
    const container = await renderPane()
    let finish: ((value: []) => void) | undefined
    vi.mocked(window.api.ephemeralVm.listRecipeCatalog).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    let refreshed: Promise<boolean> | undefined
    await act(async () => {
      refreshed = requestVmPaneAction('refresh')
    })
    expect(container.querySelector('[data-vm-catalog-loading="true"]')).not.toBeNull()
    await act(async () => {
      finish?.([])
      expect(await refreshed).toBe(true)
    })
    expect(container.querySelector('[data-vm-recipe-count="0"]')).not.toBeNull()
    expect(container.querySelector('[data-vm-catalog-loading="false"]')).not.toBeNull()
    await act(async () => {
      expect(await requestVmPaneAction('copy')).toBe(true)
    })
    expect(container.querySelector('[data-vm-prompt-copied="true"]')).not.toBeNull()
    expect(mockStoreState.recordFeatureInteraction).toHaveBeenCalledWith('ephemeral-vm-setup')
    await act(async () => {
      roots.pop()?.unmount()
    })
    expect(() => requestVmPaneAction('refresh')).toThrow('vm_pane_unavailable')
  })

  it('reports failed clipboard readback without copied feedback', async () => {
    const container = await renderPane()
    vi.mocked(window.api.ui.readClipboardText).mockResolvedValueOnce('different clipboard')
    await act(async () => {
      expect(await requestVmPaneAction('copy')).toBe(false)
    })
    expect(container.querySelector('[data-vm-prompt-copied="true"]')).toBeNull()
    expect(toastMocks.error).toHaveBeenCalled()
  })

  it('renders the skill panel and recipe, and opens the composer with the recipe selected', async () => {
    const container = await renderPane()

    await vi.waitFor(() => expect(container.textContent).toContain('Cloud Sandbox'))
    await vi.waitFor(() => expect(container.textContent).toContain('Cloud VM setup skill'))
    expect(container.textContent).toContain('What the skill does, with you')
    const useButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Use in workspace'
    )
    expect(useButton).toBeDefined()

    await act(async () => {
      useButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(storeMocks.openModal).toHaveBeenCalledWith('new-workspace-composer', {
      initialRepoId: 'repo-1',
      initialEphemeralVmRecipeId: 'cloud-sandbox',
      telemetrySource: 'settings'
    })
  })

  it('does not schedule a reset when clipboard completion arrives after unmount', async () => {
    let finishClipboard!: () => void
    vi.mocked(window.api.ui.writeClipboardText).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishClipboard = resolve
      })
    )
    const container = await renderPane()
    const setTimeout = vi.spyOn(window, 'setTimeout')
    try {
      await act(async () => {
        container.querySelector<HTMLButtonElement>('button[aria-label="Copy"]')?.click()
      })
      await act(async () => roots.pop()?.unmount())
      setTimeout.mockClear()
      await act(async () => {
        finishClipboard()
        await Promise.resolve()
      })
      expect(setTimeout.mock.calls.filter(([, delay]) => delay === 1500)).toHaveLength(0)
    } finally {
      setTimeout.mockRestore()
    }
  })

  it('shows copied feedback while mounted and releases its reset on unmount', async () => {
    const container = await renderPane()
    const setTimeout = vi.spyOn(window, 'setTimeout')
    const clearTimeout = vi.spyOn(window, 'clearTimeout')
    try {
      await act(async () => {
        container.querySelector<HTMLButtonElement>('button[aria-label="Copy"]')?.click()
      })
      expect(container.querySelector('button[aria-label="Copy"]')?.textContent).toBe('Copied')
      const timerIndex = setTimeout.mock.calls.findIndex(([, delay]) => delay === 1500)
      expect(timerIndex).toBeGreaterThanOrEqual(0)
      const timer = setTimeout.mock.results[timerIndex].value
      await act(async () => roots.pop()?.unmount())
      expect(clearTimeout).toHaveBeenCalledWith(timer)
    } finally {
      setTimeout.mockRestore()
      clearTimeout.mockRestore()
    }
  })

  it('refreshes the catalog when plugin content changes', async () => {
    const listRecipeCatalog = window.api.ephemeralVm.listRecipeCatalog as ReturnType<typeof vi.fn>
    const container = await renderPane()
    await vi.waitFor(() => expect(container.textContent).toContain('Cloud Sandbox'))
    listRecipeCatalog.mockResolvedValueOnce([
      {
        repoId: 'repo-1',
        repoName: 'Repo',
        repoPath: '/repo',
        diagnostics: [],
        recipes: [{ id: 'plugin-recipe', name: 'Plugin Recipe', create: 'create' }]
      }
    ])

    await act(async () => {
      ;(window.api.plugins as never as { emitContentChanged: () => void }).emitContentChanged()
    })

    await vi.waitFor(() => expect(container.textContent).toContain('Plugin Recipe'))
    expect(listRecipeCatalog).toHaveBeenCalledTimes(2)
  })

  it('ignores an older refresh that finishes after a plugin-content refresh', async () => {
    const listRecipeCatalog = window.api.ephemeralVm.listRecipeCatalog as ReturnType<typeof vi.fn>
    let resolveInitial!: (catalog: unknown[]) => void
    listRecipeCatalog
      .mockReset()
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveInitial = resolve
        })
      )
      .mockResolvedValueOnce([
        {
          repoId: 'repo-1',
          repoName: 'Repo',
          repoPath: '/repo',
          diagnostics: [],
          recipes: [{ id: 'new', name: 'Newest Recipe', create: 'create' }]
        }
      ])

    const container = await renderPane()
    await act(async () => {
      ;(window.api.plugins as never as { emitContentChanged: () => void }).emitContentChanged()
    })
    await vi.waitFor(() => expect(container.textContent).toContain('Newest Recipe'))

    await act(async () => {
      resolveInitial([
        {
          repoId: 'repo-1',
          repoName: 'Repo',
          repoPath: '/repo',
          diagnostics: [],
          recipes: [{ id: 'stale', name: 'Stale Recipe', create: 'create' }]
        }
      ])
      await Promise.resolve()
    })

    expect(container.textContent).toContain('Newest Recipe')
    expect(container.textContent).not.toContain('Stale Recipe')
  })
})
