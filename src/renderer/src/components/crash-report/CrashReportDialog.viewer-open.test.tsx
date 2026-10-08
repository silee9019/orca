import type { CrashReportRecord } from '../../../../shared/crash-reporting'
// @vitest-environment happy-dom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CrashReportDialog } from './CrashReportDialog'
import { readCrashReportOpenSurface } from '@/runtime/crash-report-open-surface'

const fixture = vi.hoisted(() => {
  const receiveHolder: { receive: (() => void) | null } = { receive: null }
  return {
    ...receiveHolder,
    getLatestPending: vi.fn(),
    getLatestReport: vi.fn(),
    dismiss: vi.fn(),
    unsubscribe: vi.fn()
  }
})
vi.mock('@/lib/react-error-boundary-reporting', () => ({
  REACT_ERROR_BOUNDARY_REPORT_AVAILABLE_EVENT: 'test-crash-report-available',
  takePendingReactErrorBoundaryReport: () => null
}))
vi.mock('./CrashReportDialogSurface', () => ({
  CrashReportDialogSurface: (props: {
    openEpoch: number
    openSource: string
    onOpenChange: (value: boolean) => void
  }) => (
    <div data-testid="surface" data-epoch={props.openEpoch} data-source={props.openSource}>
      <button onClick={() => props.onOpenChange(false)}>Close fixture</button>
    </div>
  )
}))
let originalApi: PropertyDescriptor | undefined
beforeEach(() => {
  originalApi = Object.getOwnPropertyDescriptor(window, 'api')
  fixture.getLatestPending.mockResolvedValue(null)
  fixture.getLatestReport.mockResolvedValue(null)
  fixture.dismiss.mockResolvedValue(null)
  fixture.receive = null
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      ui: {
        onOpenCrashReport: (callback: () => void) => {
          fixture.receive = callback
          return fixture.unsubscribe
        }
      },
      crashReports: {
        getLatestPending: fixture.getLatestPending,
        getLatestReport: fixture.getLatestReport,
        dismiss: fixture.dismiss
      }
    }
  })
})
afterEach(() => {
  cleanup()
  if (originalApi) {
    Object.defineProperty(window, 'api', originalApi)
  } else {
    Reflect.deleteProperty(window, 'api')
  }
  vi.clearAllMocks()
})
it('shares the manual callback and revokes its epoch on close and unmount', async () => {
  const rendered = render(<CrashReportDialog />)
  await waitFor(() => expect(readCrashReportOpenSurface()).not.toBeNull())
  const surface = readCrashReportOpenSurface()
  if (!surface || !fixture.receive) {
    throw new Error('fixture subscription missing')
  }
  act(() => {
    fixture.receive?.()
  })
  await screen.findByTestId('surface')
  expect(fixture.getLatestReport).toHaveBeenCalledTimes(1)
  expect(screen.getByTestId('surface').dataset.source).toBe('help_menu')
  let epoch = 0
  act(() => {
    epoch = surface.openFromHelp()
  })
  await waitFor(() => expect(screen.getByTestId('surface').dataset.epoch).toBe(String(epoch)))
  expect(fixture.getLatestReport).toHaveBeenCalledTimes(2)
  expect(surface.isCurrent(epoch)).toBe(true)
  act(() => {
    screen.getByText('Close fixture').click()
  })
  expect(surface.isCurrent(epoch)).toBe(false)
  rendered.unmount()
  expect(readCrashReportOpenSurface()).toBeNull()
  expect(fixture.unsubscribe).toHaveBeenCalledTimes(1)
})

it.each([true, false])(
  'separates delayed startup report presence %s from the manual epoch',
  async (hasReport) => {
    let release: ((report: CrashReportRecord | null) => void) | undefined
    fixture.getLatestPending.mockReturnValue(
      new Promise<CrashReportRecord | null>((resolve) => {
        release = resolve
      })
    )
    render(<CrashReportDialog />)
    await waitFor(() => expect(readCrashReportOpenSurface()).not.toBeNull())
    const surface = readCrashReportOpenSurface()
    if (!surface) {
      throw new Error('fixture surface missing')
    }
    let epoch = 0
    act(() => {
      epoch = surface.openFromHelp()
    })
    await screen.findByTestId('surface')
    expect(surface.isCurrent(epoch)).toBe(true)
    const report: CrashReportRecord = {
      id: 'synthetic',
      createdAt: '2026-10-08T00:00:00.000Z',
      status: 'pending',
      source: 'renderer',
      processType: 'renderer',
      reason: 'synthetic fixture',
      exitCode: 1,
      appVersion: 'fixture',
      platform: 'darwin',
      osRelease: 'fixture',
      arch: 'fixture',
      electronVersion: 'fixture',
      chromeVersion: 'fixture',
      details: {}
    }
    await act(async () => {
      if (!release) {
        throw new Error('fixture startup missing')
      }
      release(hasReport ? report : null)
    })
    if (hasReport) {
      await waitFor(() => expect(screen.getByTestId('surface').dataset.source).toBe('automatic'))
      expect(surface.isCurrent(epoch)).toBe(false)
      expect(fixture.dismiss).toHaveBeenCalledExactlyOnceWith({ reportId: 'synthetic' })
    } else {
      expect(screen.getByTestId('surface').dataset.source).toBe('help_menu')
      expect(surface.isCurrent(epoch)).toBe(true)
      expect(fixture.dismiss).not.toHaveBeenCalled()
    }
  }
)
