import { applyActivityThreadPreviewEditRequest } from './activity-thread-preview-edit-command'
import { applyActivityThreadPreviewRequest } from './activity-thread-preview-command'
import { applyActivityThreadCopyRequest } from './activity-thread-copy-command'
import { applyActivityListScrollRequest } from './activity-list-scroll-command'
import { applyActivityThreadListResizeRequest } from './activity-thread-list-resize-command'
import { applyActivityPageCloseRequest } from './activity-page-close-command'
import { applyActivityGroupCollapseRequest } from './activity-group-collapse-command'
import { applyActivityNavigationRequest } from './activity-navigation-command'
import type {
  ActivityViewerRequest,
  ActivityViewerResult
} from '../../../shared/activity-viewer-command'
import type { ActivityViewerCommand } from '../../../shared/rpc-contract/activity-viewer-params'

export function applyActivityViewerDirectRequest(
  request: ActivityViewerRequest,
  command: ActivityViewerCommand
): Promise<Omit<ActivityViewerResult, 'viewerId'>> | null {
  if (command.operation === 'preview-edit') {
    return applyActivityThreadPreviewEditRequest(request, command)
  }
  if (command.operation === 'preview') {
    return applyActivityThreadPreviewRequest(request, command)
  }
  if (command.operation === 'copy' || command.operation === 'preview-copy-path') {
    return applyActivityThreadCopyRequest(request, command)
  }
  if (command.operation === 'scroll') {
    return applyActivityListScrollRequest(request, command)
  }
  if (command.operation === 'resize') {
    return applyActivityThreadListResizeRequest(request, command)
  }
  if (command.operation === 'close') {
    return applyActivityPageCloseRequest(request)
  }
  if (command.operation === 'group-toggle') {
    return applyActivityGroupCollapseRequest(request, command)
  }
  if (command.operation === 'jump' || command.operation === 'select') {
    return applyActivityNavigationRequest(request, command)
  }
  return null
}
