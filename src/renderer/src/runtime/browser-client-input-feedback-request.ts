import { useAppStore } from '@/store'
import { resolveWorkspaceDocAddressTarget } from '@/lib/workspace-doc-address-input'
import { resolveBrowserAddressBarSubmission } from '@/components/browser-pane/navigate/browser-address-bar-navigation'
import {
  BrowserClientInputFeedbackCommand,
  type BrowserClientInputFeedbackState
} from '../../../shared/rpc-contract/browser-client-input-feedback-params'
import type { z } from 'zod'
export type ClientInputFeedbackCommand = z.infer<typeof BrowserClientInputFeedbackCommand>
export function resolveClientInputFeedback(command: ClientInputFeedbackCommand) {
  if (
    resolveWorkspaceDocAddressTarget(
      useAppStore.getState(),
      command.source.target.worktreeId,
      command.value
    ).status !== 'not-a-workspace-doc'
  ) {
    throw new Error('browser_client_input_feedback_document_unsupported')
  }
  const submission = resolveBrowserAddressBarSubmission(command.value, { allowFileUrls: false })
  if (submission.status !== 'invalid') {
    throw new Error('browser_client_input_feedback_rejection_required')
  }
  return submission.loadError
}
export class BrowserClientInputFeedbackEvent extends Event {
  readonly offers: (() => Promise<BrowserClientInputFeedbackState>)[] = []
  constructor(
    readonly command: ClientInputFeedbackCommand,
    readonly expiresAt: number
  ) {
    super('orca:browser-client-input-feedback')
  }
}
export async function requestBrowserClientInputFeedback(
  command: ClientInputFeedbackCommand,
  expiresAt: number
): Promise<BrowserClientInputFeedbackState> {
  const parsed = BrowserClientInputFeedbackCommand.parse(command)
  if (Date.now() >= expiresAt) {
    throw new Error('browser_client_input_feedback_expired')
  }
  resolveClientInputFeedback(parsed)
  const event = new BrowserClientInputFeedbackEvent(parsed, expiresAt)
  window.dispatchEvent(event)
  if (event.offers.length !== 1) {
    throw new Error(
      event.offers.length
        ? 'browser_client_input_feedback_ambiguous'
        : 'browser_client_input_feedback_unavailable'
    )
  }
  const result = await event.offers[0]()
  if (Date.now() >= expiresAt) {
    throw new Error('browser_client_input_feedback_expired')
  }
  return result
}
