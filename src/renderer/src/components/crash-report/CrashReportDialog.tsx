import { publishCrashReportOpenSurface } from '@/runtime/crash-report-open-surface'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { lazyWithRetry as lazy } from '@/lib/lazy-with-retry'
import { useMountedRef } from '@/hooks/useMountedRef'
import {
  REACT_ERROR_BOUNDARY_REPORT_AVAILABLE_EVENT,
  takePendingReactErrorBoundaryReport
} from '@/lib/react-error-boundary-reporting'
import type { CrashReportRecord } from '../../../../shared/crash-reporting'

const CrashReportDialogSurface = lazy(() =>
  import('./CrashReportDialogSurface').then((module) => ({
    default: module.CrashReportDialogSurface
  }))
)

export function CrashReportDialog(): React.JSX.Element | null {
  const promptedThisLaunch = useRef(false)
  const mountedRef = useMountedRef()
  const [open, setOpen] = useState(false)
  const [report, setReport] = useState<CrashReportRecord | null>(null)
  const [loading, setLoading] = useState(false)
  const [openIdentity, setOpenIdentity] = useState<{
    epoch: number
    source: 'help_menu' | 'automatic'
  }>({ epoch: 0, source: 'automatic' })
  const identityRef = useRef(openIdentity)
  const advanceSurface = useCallback((source: 'help_menu' | 'automatic'): number => {
    const next = { epoch: identityRef.current.epoch + 1, source }
    identityRef.current = next
    setOpenIdentity(next)
    return next.epoch
  }, [])
  const handleOpenChange = useCallback(
    (value: boolean): void => {
      if (!value) {
        advanceSurface('automatic')
      }
      setOpen(value)
    },
    [advanceSurface]
  )

  const openCrashReport = useCallback(
    (nextReport: CrashReportRecord): void => {
      advanceSurface('automatic')
      setReport(nextReport)
      setOpen(true)
    },
    [advanceSurface]
  )

  const loadCrashReport = useCallback(
    async (promptIfPresent: boolean): Promise<void> => {
      setLoading(true)
      try {
        const nextReport = promptIfPresent
          ? await window.api.crashReports.getLatestPending()
          : await window.api.crashReports.getLatestReport()
        let displayedReport = nextReport
        if (nextReport?.status === 'pending' && promptIfPresent) {
          try {
            // Why: startup crash prompts are one-shot. The lazy dialog keeps the
            // report data locally if the user sends immediately, while Help >
            // Report Crash can still reopen dismissed unsent reports.
            await window.api.crashReports.dismiss({ reportId: nextReport.id })
            displayedReport = { ...nextReport, status: 'dismissed' as const }
          } catch (error) {
            console.error('Failed to dismiss crash report after startup prompt:', error)
          }
        }
        if (!mountedRef.current) {
          return
        }
        setReport(displayedReport)
        if (nextReport && promptIfPresent) {
          advanceSurface('automatic')
          setOpen(true)
        }
      } catch (error) {
        console.error('Failed to load crash report:', error)
      } finally {
        if (mountedRef.current) {
          setLoading(false)
        }
      }
    },
    [advanceSurface, mountedRef]
  )

  useEffect(() => {
    if (promptedThisLaunch.current) {
      return
    }
    promptedThisLaunch.current = true
    void loadCrashReport(true)
  }, [loadCrashReport])

  const openFromHelp = useCallback((): number => {
    const epoch = advanceSurface('help_menu')
    setReport(null)
    setOpen(true)
    void loadCrashReport(false)
    return epoch
  }, [advanceSurface, loadCrashReport])

  useEffect(() => window.api.ui.onOpenCrashReport(openFromHelp), [openFromHelp])
  useEffect(
    () =>
      publishCrashReportOpenSurface({
        openFromHelp,
        isCurrent: (epoch) =>
          mountedRef.current &&
          identityRef.current.epoch === epoch &&
          identityRef.current.source === 'help_menu'
      }),
    [mountedRef, openFromHelp]
  )

  useEffect(() => {
    const pendingReport = takePendingReactErrorBoundaryReport()
    if (pendingReport) {
      openCrashReport(pendingReport)
    }

    const onReactErrorBoundaryReport = (): void => {
      const nextReport = takePendingReactErrorBoundaryReport()
      if (nextReport) {
        openCrashReport(nextReport)
      }
    }

    window.addEventListener(REACT_ERROR_BOUNDARY_REPORT_AVAILABLE_EVENT, onReactErrorBoundaryReport)
    return () => {
      window.removeEventListener(
        REACT_ERROR_BOUNDARY_REPORT_AVAILABLE_EVENT,
        onReactErrorBoundaryReport
      )
    }
  }, [openCrashReport])

  if (!open) {
    return null
  }

  return (
    <Suspense fallback={null}>
      <CrashReportDialogSurface
        open={open}
        openEpoch={openIdentity.epoch}
        openSource={openIdentity.source}
        report={report}
        loading={loading}
        onOpenChange={handleOpenChange}
        onReportChange={setReport}
      />
    </Suspense>
  )
}
