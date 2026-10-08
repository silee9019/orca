import type { captureActivityThreadCommandTarget } from './activity-thread-command-target'
import { captureActivityThreadPreviewAction } from './activity-thread-preview-action'
export function captureActivityPreviewCopyTarget(
  context: ReturnType<typeof captureActivityThreadCommandTarget>
) {
  return {
    ...captureActivityThreadPreviewAction(context, 'copy-path'),
    target: { key: 'path', label: '', value: context.thread.worktree.path }
  }
}
