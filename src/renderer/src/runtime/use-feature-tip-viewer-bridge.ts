import { useEffect } from 'react'
import { attachFeatureTipViewerBridge } from './feature-tip-viewer-bridge'
export function useFeatureTipViewerBridge(): void {
  useEffect(() => attachFeatureTipViewerBridge(window.api.ui), [])
}
