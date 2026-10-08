import { BrowserClientInputFeedbackCommand } from './browser-client-input-feedback-params'
import { BrowserClientHistoryDocumentCommand } from './browser-client-history-document-params'
import { BrowserClientHistoryViewerCommand } from './browser-client-history-params'
import { BrowserClientDeferredViewerCommand } from './browser-client-deferred-params'
import { BrowserClientDocumentViewerCommands } from './browser-client-staged-document-params'
import { BrowserClientSubmissionViewerCommand } from './browser-client-submission-params'
import { BrowserClientReloadViewerCommand } from './browser-client-reload-params'
import { BrowserClientFindViewerCommand } from './browser-client-find-params'
import { BrowserClientAddressViewerCommand } from './browser-client-address-params'
import { BrowserClientNavigationViewerCommand } from './browser-client-navigation-params'

export const BrowserClientNavigationCommands = [
  BrowserClientInputFeedbackCommand,
  BrowserClientHistoryDocumentCommand,
  BrowserClientHistoryViewerCommand,
  BrowserClientDeferredViewerCommand,
  ...BrowserClientDocumentViewerCommands,
  BrowserClientSubmissionViewerCommand,
  BrowserClientReloadViewerCommand,
  BrowserClientFindViewerCommand,
  BrowserClientAddressViewerCommand,
  BrowserClientNavigationViewerCommand
] as const
