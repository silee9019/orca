import {
  startVmRuntimeViewerRequest,
  readVmRuntimeViewerRequest
} from '@/runtime/vm-runtime-viewer-request'
// @vitest-environment happy-dom

import { requestVmCleanupConfirm } from '@/runtime/vm-cleanup-confirm-request'
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EphemeralVmRuntimeRecord } from '../../../../shared/ephemeral-vm-runtimes'
import {
  EphemeralVmRuntimesSection,
  getEphemeralVmRuntimeStatusLabel,
  getVisibleEphemeralVmRuntimes
} from './EphemeralVmRuntimesSection'

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn()
}))

vi.mock('sonner', () => ({
  toast: {
    success: toastMocks.success,
    error: toastMocks.error
  }
}))

vi.mock('../ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div data-slot="dialog-content">{children}</div>
  ),
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

const roots: Root[] = []

function makeRuntime(overrides: Partial<EphemeralVmRuntimeRecord> = {}): EphemeralVmRuntimeRecord {
  return {
    id: 'runtime-1',
    recipeId: 'cloud-sandbox',
    projectId: 'project-1',
    workspaceName: 'Fix Login Race',
    status: 'running',
    cleanupStatus: 'not_started',
    createdAt: 1_000,
    updatedAt: 1_000,
    recipeResult: {
      schemaVersion: 1,
      pairingCode: 'orca://pair?code=test',
      projectRoot: '/workspace/repo'
    },
    ...overrides
  }
}

async function renderSection(): Promise<HTMLDivElement> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => {
    root.render(<EphemeralVmRuntimesSection />)
  })
  return container
}

describe('EphemeralVmRuntimesSection helpers', () => {
  it('hides cleaned runtimes and sorts active runtimes newest first', () => {
    expect(
      getVisibleEphemeralVmRuntimes([
        makeRuntime({ id: 'old', createdAt: 1 }),
        makeRuntime({ id: 'cleaned', status: 'cleaned', cleanupStatus: 'succeeded', createdAt: 3 }),
        makeRuntime({ id: 'new', createdAt: 2 })
      ]).map((runtime) => runtime.id)
    ).toEqual(['new', 'old'])
  })

  it('keeps a cleaned runtime visible while hidden SSH teardown is incomplete', () => {
    const runtime = makeRuntime({
      status: 'cleaned',
      cleanupStatus: 'succeeded',
      sshTargetId: 'runtime-ssh-cleanup-retry'
    })

    expect(getVisibleEphemeralVmRuntimes([runtime])).toEqual([runtime])
    expect(getEphemeralVmRuntimeStatusLabel(runtime)).toBe('Cleanup failed')
  })

  it('prioritizes cleanup status in the visible label', () => {
    expect(getEphemeralVmRuntimeStatusLabel(makeRuntime())).toBe('Running')
    expect(getEphemeralVmRuntimeStatusLabel(makeRuntime({ cleanupStatus: 'failed' }))).toBe(
      'Cleanup failed'
    )
    expect(
      getEphemeralVmRuntimeStatusLabel(
        makeRuntime({
          cleanupStatus: 'failed',
          cleanupLastError: 'Cleanup stopped by user.'
        })
      )
    ).toBe('Cleanup stopped')
    expect(getEphemeralVmRuntimeStatusLabel(makeRuntime({ cleanupStatus: 'disabled' }))).toBe(
      'Cleanup disabled'
    )
  })
})

describe('EphemeralVmRuntimesSection', () => {
  it('opens and cancels the exact renderer confirmation without stopping cleanup', async () => {
    const container = await renderSection()
    await act(async () => {
      expect(requestVmCleanupConfirm({ operation: 'open', runtimeId: 'runtime-1' })).toBe(true)
    })
    expect(
      container
        .querySelector('[data-vm-cleanup-confirm-runtime]')
        ?.getAttribute('data-vm-cleanup-confirm-runtime')
    ).toBe('runtime-1')
    await act(async () => {
      expect(requestVmCleanupConfirm({ operation: 'cancel', runtimeId: 'other-runtime' })).toBe(
        false
      )
    })
    expect(container.textContent).toContain('Stop cleanup?')
    await act(async () => {
      expect(requestVmCleanupConfirm({ operation: 'cancel', runtimeId: 'runtime-1' })).toBe(true)
    })
    expect(container.querySelector('[data-vm-cleanup-confirm-runtime]')).toBeNull()
    expect(window.api.ephemeralVm.stopCleanup).not.toHaveBeenCalled()
  })

  it('updates actual cleanup busy and visible rows through the typed owner', async () => {
    const container = await renderSection()
    let finish: (() => void) | undefined
    window.api.ephemeralVm.cleanup = vi.fn(
      () =>
        new Promise<EphemeralVmRuntimeRecord>((resolve) => {
          finish = () => {
            window.api.ephemeralVm.listRuntimes = vi.fn().mockResolvedValue([])
            resolve(makeRuntime({ status: 'cleaned', cleanupStatus: 'succeeded' }))
          }
        })
    )
    let id = ''
    await act(async () => {
      id = startVmRuntimeViewerRequest({ action: 'cleanup', runtimeId: 'runtime-1' }).operationId
    })
    expect(container.querySelector('[data-vm-cleaning]')?.getAttribute('data-vm-cleaning')).toBe(
      'runtime-1'
    )
    expect(readVmRuntimeViewerRequest(id).vmActionState).toBe('pending')
    if (!finish) {
      throw new Error('Missing cleanup fixture')
    }
    await act(async () => finish?.())
    expect(readVmRuntimeViewerRequest(id).vmActionState).toBe('succeeded')
    expect(
      container.querySelector('[data-vm-runtime-count]')?.getAttribute('data-vm-runtime-count')
    ).toBe('0')
    expect(container.querySelector('[data-vm-cleaning]')?.getAttribute('data-vm-cleaning')).toBe('')
    window.api.ephemeralVm.listRuntimes = vi.fn().mockResolvedValue([makeRuntime()])
    await act(async () => {
      id = startVmRuntimeViewerRequest({ action: 'refresh' }).operationId
    })
    expect(readVmRuntimeViewerRequest(id).vmActionState).toBe('succeeded')
    expect(
      container.querySelector('[data-vm-runtime-count]')?.getAttribute('data-vm-runtime-count')
    ).toBe('1')
  })

  it('finishes the exact stop confirmation and private clipboard through the typed owner', async () => {
    const container = await renderSection()
    await act(async () => {
      requestVmCleanupConfirm({ operation: 'open', runtimeId: 'runtime-1' })
    })
    let id = ''
    await act(async () => {
      id = startVmRuntimeViewerRequest({
        action: 'stop',
        runtimeId: 'runtime-1',
        confirmation: 'wrong'
      }).operationId
    })
    expect(readVmRuntimeViewerRequest(id).vmActionState).toBe('failed')
    expect(window.api.ephemeralVm.stopCleanup).not.toHaveBeenCalled()
    expect(container.querySelector('[data-vm-cleanup-confirm-runtime]')).not.toBeNull()
    await act(async () => {
      id = startVmRuntimeViewerRequest({
        action: 'stop',
        runtimeId: 'runtime-1',
        confirmation: 'runtime-1'
      }).operationId
    })
    expect(readVmRuntimeViewerRequest(id).vmActionState).toBe('succeeded')
    expect(container.querySelector('[data-vm-cleanup-confirm-runtime]')).toBeNull()
    expect(container.querySelector('[data-vm-stopping]')?.getAttribute('data-vm-stopping')).toBe('')
    await act(async () => {
      id = startVmRuntimeViewerRequest({ action: 'copy', runtimeId: 'runtime-1' }).operationId
    })
    expect(readVmRuntimeViewerRequest(id).vmActionState).toBe('succeeded')
    expect(await window.api.ui.readClipboardText()).toContain('Cleanup payload:')
    expect(JSON.stringify(readVmRuntimeViewerRequest(id))).not.toContain('payloadJson')
  })

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    toastMocks.success.mockClear()
    toastMocks.error.mockClear()
    let clipboard = ''
    Object.assign(window, {
      api: {
        ephemeralVm: {
          listRuntimes: vi.fn().mockResolvedValue([makeRuntime()]),
          getCleanupCommand: vi.fn().mockResolvedValue({
            runtimeId: 'runtime-1',
            command:
              'node -e \'process.stdout.write(Buffer.from("e30K", "base64").toString("utf8"))\' | ./cleanup.sh',
            payloadJson: '{}',
            cleanupDisabled: false
          }),
          cleanup: vi.fn().mockResolvedValue(
            makeRuntime({
              status: 'cleaned',
              cleanupStatus: 'succeeded'
            })
          ),
          stopCleanup: vi.fn().mockResolvedValue(
            makeRuntime({
              status: 'cleanup_failed',
              cleanupStatus: 'failed',
              cleanupLastError: 'Cleanup stopped by user.'
            })
          )
        },
        ui: {
          writeClipboardText: vi.fn(async (text: string) => {
            clipboard = text
          }),
          readClipboardText: vi.fn(async () => clipboard)
        }
      }
    })
  })

  afterEach(() => {
    roots.splice(0).forEach((root) => {
      act(() => root.unmount())
    })
    document.body.replaceChildren()
    vi.useRealTimers()
  })

  it('renders active Cloud VM runtimes and cleans one up', async () => {
    const container = await renderSection()

    await vi.waitFor(() => expect(container.textContent).toContain('Fix Login Race'))
    expect(container.textContent).toContain('/workspace/repo')

    const cleanupButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Cleanup'
    )
    expect(cleanupButton).toBeDefined()
    await act(async () => {
      cleanupButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(window.api.ephemeralVm.cleanup).toHaveBeenCalledWith({ runtimeId: 'runtime-1' })
    await vi.waitFor(() => expect(toastMocks.success).toHaveBeenCalled())
  })

  it('shows the empty state when no runtime needs cleanup', async () => {
    window.api.ephemeralVm.listRuntimes = vi
      .fn()
      .mockResolvedValue([makeRuntime({ status: 'cleaned', cleanupStatus: 'succeeded' })])

    const container = await renderSection()

    await vi.waitFor(() =>
      expect(container.textContent).toContain(
        'No Cloud VM runtimes yet. Create one from a workspace using an environment recipe.'
      )
    )
  })

  it('surfaces cleanup hook failures returned by the cleanup IPC', async () => {
    window.api.ephemeralVm.cleanup = vi.fn().mockResolvedValue(
      makeRuntime({
        status: 'cleanup_failed',
        cleanupStatus: 'failed',
        cleanupLastError: 'provider delete failed'
      })
    )
    const container = await renderSection()

    await vi.waitFor(() => expect(container.textContent).toContain('Fix Login Race'))
    const cleanupButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Cleanup'
    )
    await act(async () => {
      cleanupButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await vi.waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith('provider delete failed'))
    expect(toastMocks.success).not.toHaveBeenCalled()
  })

  it('stops running cleanup from a persistent runtime row', async () => {
    const running = makeRuntime({ status: 'cleanup_pending', cleanupStatus: 'running' })
    const stopped = makeRuntime({
      status: 'cleanup_failed',
      cleanupStatus: 'failed',
      cleanupLastError: 'Cleanup stopped by user.'
    })
    window.api.ephemeralVm.listRuntimes = vi
      .fn()
      .mockResolvedValueOnce([running])
      .mockResolvedValue([stopped])
    window.api.ephemeralVm.stopCleanup = vi.fn().mockResolvedValue(stopped)
    const container = await renderSection()

    await vi.waitFor(() => expect(container.textContent).toContain('Stop cleanup'))
    const stopButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Stop cleanup'
    )
    await act(async () => {
      stopButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await vi.waitFor(() => expect(document.body.textContent).toContain('The VM may remain running'))
    const dialog = document.body.querySelector('[data-slot="dialog-content"]')
    const confirmButton = [...(dialog?.querySelectorAll('button') ?? [])].find(
      (button) => button.textContent === 'Stop cleanup'
    )
    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    await vi.waitFor(() =>
      expect(window.api.ephemeralVm.stopCleanup).toHaveBeenCalledWith({ runtimeId: 'runtime-1' })
    )
    await vi.waitFor(() => expect(container.textContent).toContain('Retry cleanup'))
    expect(container.textContent).toContain('Cleanup stopped by user.')
  })

  it('does not repeat load-error toasts while polling a running cleanup', async () => {
    vi.useFakeTimers()
    window.api.ephemeralVm.listRuntimes = vi
      .fn()
      .mockResolvedValueOnce([makeRuntime({ status: 'cleanup_pending', cleanupStatus: 'running' })])
      .mockRejectedValue(new Error('IPC unavailable'))

    const container = await renderSection()
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(container.textContent).toContain('Stop cleanup')
    toastMocks.error.mockClear()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })

    expect(toastMocks.error).not.toHaveBeenCalled()
  })

  it('copies a manual cleanup command for failed runtimes', async () => {
    window.api.ephemeralVm.listRuntimes = vi.fn().mockResolvedValue([
      makeRuntime({
        status: 'cleanup_failed',
        cleanupStatus: 'failed',
        cleanupLastError: 'provider delete failed'
      })
    ])
    const container = await renderSection()

    await vi.waitFor(() => expect(container.textContent).toContain('Copy command'))
    const copyButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Copy command'
    )
    await act(async () => {
      copyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(window.api.ephemeralVm.getCleanupCommand).toHaveBeenCalledWith({
      runtimeId: 'runtime-1'
    })
    expect(window.api.ui.writeClipboardText).toHaveBeenCalledWith(
      expect.stringContaining('Cleanup payload:')
    )
    expect(toastMocks.success).toHaveBeenCalledWith('Copied cleanup command.')
  })

  it('offers retry when provider cleanup succeeded but hidden SSH teardown failed', async () => {
    window.api.ephemeralVm.listRuntimes = vi.fn().mockResolvedValue([
      makeRuntime({
        status: 'cleanup_failed',
        cleanupStatus: 'succeeded',
        sshTargetId: 'runtime-ssh-cleanup-retry',
        cleanupLastError: 'Failed to remove the hidden SSH target.'
      })
    ])
    const container = await renderSection()

    await vi.waitFor(() => expect(container.textContent).toContain('Cleanup failed'))
    expect(
      [...container.querySelectorAll('button')].some(
        (button) => button.textContent === 'Retry cleanup'
      )
    ).toBe(true)
  })
})
