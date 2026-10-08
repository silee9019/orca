import type { StatusBarItem } from '../../../../shared/ui-chrome-types'
import type { FeatureInteractionId } from '../../../../shared/feature-interaction-catalog'

export function recordStatusBarToggleInteraction(
  id: StatusBarItem,
  recordFeatureInteraction: (feature: FeatureInteractionId) => void | Promise<void>
): void | Promise<void> {
  if (id === 'resource-usage') {
    return recordFeatureInteraction('resource-manager')
  } else if (id === 'ports') {
    return recordFeatureInteraction('ports')
  } else if (id === 'ssh') {
    return recordFeatureInteraction('ssh')
  } else if (
    id === 'claude' ||
    id === 'codex' ||
    id === 'gemini' ||
    id === 'opencode-go' ||
    id === 'kimi' ||
    id === 'antigravity' ||
    id === 'minimax' ||
    id === 'grok' ||
    id === 'cursor'
  ) {
    return recordFeatureInteraction('usage-tracking')
  }
}
