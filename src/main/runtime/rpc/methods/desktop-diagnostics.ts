import { defineMethod } from '../core'
import {
  DesktopDiagnosticBundleParams,
  DesktopDiagnosticCollectParams,
  DesktopDiagnosticDeleteParams,
  DesktopDiagnosticUploadParams
} from '../../../../shared/rpc-contract/app-lifecycle-params'
import { assertDesktopAppContext } from './desktop-app-target'

export const DESKTOP_DIAGNOSTICS_METHODS = [
  defineMethod({
    name: 'desktopDiagnostics.getStatus',
    params: null,
    handler: async (_params, context) => {
      assertDesktopAppContext(context)
      return (await import('../../../ipc/diagnostics')).getDiagnosticsOperations().getStatus()
    }
  }),
  defineMethod({
    name: 'desktopDiagnostics.collectBundle',
    params: DesktopDiagnosticCollectParams,
    handler: async (params, context) => {
      assertDesktopAppContext(context)
      return (await import('../../../ipc/diagnostics'))
        .getDiagnosticsOperations()
        .collectBundle(params.lookbackMinutes)
    }
  }),
  defineMethod({
    name: 'desktopDiagnostics.readBundle',
    params: DesktopDiagnosticBundleParams,
    handler: async (params, context) => {
      assertDesktopAppContext(context)
      return (await import('../../../ipc/diagnostics')).readDiagnosticBundlePreview(
        params.bundleSubmissionId
      )
    }
  }),
  defineMethod({
    name: 'desktopDiagnostics.discardBundle',
    params: DesktopDiagnosticBundleParams,
    handler: async (params, context) => {
      assertDesktopAppContext(context)
      ;(await import('../../../ipc/diagnostics'))
        .getDiagnosticsOperations()
        .discardBundlePreview(params.bundleSubmissionId)
      return { state: 'discarded' as const }
    }
  }),
  defineMethod({
    name: 'desktopDiagnostics.uploadBundle',
    params: DesktopDiagnosticUploadParams,
    handler: async (params, context) => {
      assertDesktopAppContext(context)
      if (params.bundleSubmissionId !== params.confirmSubmissionId) {
        throw new Error('Confirm the exact reviewed diagnostic submission ID')
      }
      return (await import('../../../ipc/diagnostics')).sendReviewedDiagnosticBundle(
        params.bundleSubmissionId
      )
    }
  }),
  defineMethod({
    name: 'desktopDiagnostics.deleteBundle',
    params: DesktopDiagnosticDeleteParams,
    handler: async (params, context) => {
      assertDesktopAppContext(context)
      if (params.ticketId !== params.confirmTicketId) {
        throw new Error('Confirm the exact uploaded diagnostic ticket ID')
      }
      await (
        await import('../../../ipc/diagnostics')
      )
        .getDiagnosticsOperations()
        .deleteBundle(params.ticketId)
      return { state: 'deleted' as const, ticketId: params.ticketId }
    }
  })
]
