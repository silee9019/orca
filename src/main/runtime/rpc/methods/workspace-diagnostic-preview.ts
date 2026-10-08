import { DesktopDiagnosticPreviewOpen } from '../../../../shared/rpc-contract/workspace-diagnostic-preview-params'
import { defineMethod } from '../core'

type OpenPreview = (bundleSubmissionId: string) => Promise<void>
let openDesktopDiagnosticPreview: OpenPreview | null = null
export function setDesktopDiagnosticPreviewForRpc(open: OpenPreview | null): void {
  openDesktopDiagnosticPreview = open
}
export const WORKSPACE_DIAGNOSTIC_PREVIEW_METHODS = [
  defineMethod({
    name: 'diagnostics.openRetainedPreview',
    params: DesktopDiagnosticPreviewOpen,
    handler: async (params) => {
      if (!openDesktopDiagnosticPreview) {
        throw new Error('runtime_unavailable')
      }
      try {
        await openDesktopDiagnosticPreview(params.bundleSubmissionId)
        return { opened: true as const }
      } catch {
        throw new Error('Diagnostic preview open failed.')
      }
    }
  })
]
