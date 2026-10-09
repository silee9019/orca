import { useLayoutEffect } from 'react'
import { useAppStore } from '@/store'
import { getProviderRuntimeContextKey } from '@/lib/provider-runtime-context'
import type { OrcaYamlTrustPrompt } from '../../../shared/orca-yaml-trust-viewer-command'
import {
  publishOrcaYamlTrustControl,
  publishOrcaYamlTrustView,
  type OrcaYamlTrustControl
} from './orca-yaml-trust-viewer-view'

export function useOrcaYamlTrustViewerPublication(args: {
  open: boolean
  prompt: OrcaYamlTrustPrompt
  skip: OrcaYamlTrustControl['skip']
  token: OrcaYamlTrustControl['token']
}): void {
  const { open, prompt, skip, token } = args
  const { repoId, repoName, scriptKind, previouslyApproved, contentHash } = prompt
  const runtimeContextKey = useAppStore((state) => getProviderRuntimeContextKey(state.settings))
  useLayoutEffect(() => {
    publishOrcaYamlTrustView({
      runtimeContextKey,
      open,
      prompt: { repoId, repoName, scriptKind, previouslyApproved, contentHash }
    })
    publishOrcaYamlTrustControl({ skip, token })
  }, [
    runtimeContextKey,
    open,
    repoId,
    repoName,
    scriptKind,
    previouslyApproved,
    contentHash,
    skip,
    token
  ])
  useLayoutEffect(
    () => () => {
      publishOrcaYamlTrustView(null)
      publishOrcaYamlTrustControl(null)
    },
    []
  )
}
