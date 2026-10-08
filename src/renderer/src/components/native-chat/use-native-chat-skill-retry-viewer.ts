import { useEffect, useLayoutEffect, useRef } from 'react'
import { useAppStore } from '@/store'
import { useAgentSkillSetupViewer } from '@/runtime/agent-skill-setup-viewer'
import type { NativeChatSkillDiscovery } from './use-native-chat-skills'
import type { ComposerAutocomplete } from './native-chat-composer-state'
import type { AgentType } from '../../../../shared/agent-status-types'

type Pending = {
  scope: string
  source: () => void
  generation: number
  resolve: () => void
  reject: (error: Error) => void
}
export function useNativeChatSkillRetryViewer({
  discovery,
  autocomplete,
  agent,
  tab,
  pane
}: {
  discovery: NativeChatSkillDiscovery
  autocomplete: ComposerAutocomplete
  agent: AgentType
  tab: string
  pane: string
}): void {
  const profile = useAppStore((state) => state.activeOrcaProfileId)
  const modal = useAppStore((state) => state.activeModal)
  const ownerKey = JSON.stringify([
    agent,
    tab,
    pane,
    autocomplete.mode === 'slash' ? autocomplete.triggerKey : null
  ])
  const scope = JSON.stringify([ownerKey, profile, modal])
  const pending = useRef<Pending | null>(null)
  const latest = useRef({ scope, source: discovery.retry, generation: discovery.generation })
  useLayoutEffect(() => {
    latest.current = { scope, source: discovery.retry, generation: discovery.generation }
    const request = pending.current
    if (!request) {
      return
    }
    if (
      request.scope !== scope ||
      request.source !== discovery.retry ||
      discovery.generation > request.generation
    ) {
      pending.current = null
      request.reject(new Error('viewer_target_changed'))
    } else if (
      discovery.generation === request.generation &&
      (discovery.status === 'ready' || discovery.status === 'error')
    ) {
      pending.current = null
      request.resolve()
    }
  })
  useEffect(
    () => () => {
      pending.current?.reject(new Error('viewer_unmounted'))
      pending.current = null
    },
    []
  )
  useAgentSkillSetupViewer({
    panelKey: `native-chat-skills:${tab}:${pane}`,
    title: 'Chat skill discovery',
    ownerKey: JSON.stringify([ownerKey, discovery.generation]),
    recheckOwnerKey: ownerKey,
    source: discovery.retry,
    status: {
      installed: null,
      loading: discovery.status === 'loading',
      error: discovery.error?.message ?? null
    },
    canRecheck:
      autocomplete.mode === 'slash' &&
      autocomplete.skillStatus === 'error' &&
      autocomplete.skillErrorKind !== 'unavailable',
    recheck: () =>
      new Promise<void>((resolve, reject) => {
        if (
          latest.current.scope !== scope ||
          latest.current.source !== discovery.retry ||
          latest.current.generation !== discovery.generation
        ) {
          reject(new Error('viewer_target_changed'))
          return
        }
        if (pending.current) {
          reject(new Error('viewer_busy'))
          return
        }
        pending.current = {
          scope,
          source: discovery.retry,
          generation: discovery.generation + 1,
          resolve,
          reject
        }
        try {
          discovery.retry()
        } catch (error) {
          pending.current = null
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      })
  })
}
