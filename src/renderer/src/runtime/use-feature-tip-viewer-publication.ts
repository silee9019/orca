import { useLayoutEffect } from 'react'
import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import {
  publishFeatureTipControl,
  publishFeatureTipView,
  type FeatureTipControl
} from './feature-tip-viewer-view'

export function useFeatureTipViewerPublication(args: {
  open: boolean
  tipId: string | null
  action: string | null
  skip: FeatureTipControl['skip']
}): void {
  const { open, tipId, action, skip } = args
  const runtimeContextKey = useAppStore((state) => getProviderRuntimeContextKey(state.settings))
  useLayoutEffect(() => {
    publishFeatureTipView({ runtimeContextKey, open, tipId, action })
    publishFeatureTipControl({ skip })
  }, [runtimeContextKey, open, tipId, action, skip])
  useLayoutEffect(
    () => () => {
      publishFeatureTipView(null)
      publishFeatureTipControl(null)
    },
    []
  )
}
