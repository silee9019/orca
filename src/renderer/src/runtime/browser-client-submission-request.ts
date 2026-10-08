import { useAppStore } from '@/store'
import { resolveBrowserAddressBarSubmission } from '@/components/browser-pane/navigate/browser-address-bar-navigation'
import { resolveWorkspaceDocAddressTarget } from '@/lib/workspace-doc-address-input'
import { BrowserClientNavigationUrl } from '../../../shared/rpc-contract/browser-client-navigation-params'
import { isBrowserClientPageViewerTargetCurrent } from './browser-client-page-viewer-target'
import type { z } from 'zod'
import type { BrowserViewerResult } from '../../../shared/browser-viewer-command'
import { BrowserClientSubmissionViewerCommand } from '../../../shared/rpc-contract/browser-client-submission-params'
import { requestBrowserClientNavigation } from './browser-client-navigation-request'
export async function applyBrowserClientSubmissionRequest(
  command: z.infer<typeof BrowserClientSubmissionViewerCommand>,
  expiresAt: number
): Promise<BrowserViewerResult> {
  const parsed = BrowserClientSubmissionViewerCommand.parse(command)
  if (!isBrowserClientPageViewerTargetCurrent(parsed.target)) {
    throw new Error('browser_client_submission_target_unavailable')
  }
  const doc = resolveWorkspaceDocAddressTarget(
    useAppStore.getState(),
    parsed.target.worktreeId,
    parsed.value
  )
  if (doc.status !== 'not-a-workspace-doc') {
    throw new Error('browser_client_submission_document_unsupported')
  }
  const submission = resolveBrowserAddressBarSubmission(parsed.value, { allowFileUrls: false })
  if (
    submission.status !== 'navigate' ||
    !BrowserClientNavigationUrl.safeParse(submission.url).success
  ) {
    throw new Error('browser_client_submission_web_input_required')
  }
  const clientSubmission = await requestBrowserClientNavigation(
    parsed.target,
    submission.url,
    expiresAt
  )
  return {
    viewer: 'host',
    viewerId: 0,
    applied: true,
    persisted: false,
    rendered: false,
    clientSubmission
  }
}
