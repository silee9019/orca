import type { RetiredPaneFence } from './server/server-types'

export function matchesPaneRetirement(
  fence: RetiredPaneFence | undefined,
  retirementId: string,
  currentFence: (paneKey: string) => RetiredPaneFence | undefined,
  closedTab: (paneKey: string) => boolean
): boolean {
  return Boolean(
    fence &&
    !fence.closed &&
    fence.paneKeys.length > 0 &&
    fence.paneKeys.every(
      (key) =>
        currentFence(key) === fence &&
        !closedTab(key) &&
        fence.retirementIdsByPaneKey[key] === retirementId
    )
  )
}
