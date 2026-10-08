import { useEffect, useRef, useState } from 'react'
import type { InstalledAgentSkillState } from '@/hooks/useInstalledAgentSkills'
import { useActiveSkillDiscoveryRuntimeTarget } from '@/hooks/use-active-skill-discovery-runtime-target'
import { useAppStore } from '@/store'
import { BROWSER_USE_ENABLED_STORAGE_KEY } from '@/lib/browser-use-setup-state'
import {
  BrowserFeatureWallCommand,
  BrowserFeatureWallState
} from '../../../../shared/rpc-contract/browser-feature-wall-params'
import {
  BROWSER_FEATURE_WALL_EVENT,
  type BrowserFeatureWallEvent
} from '@/runtime/browser-feature-wall-request'
import { requireBrowserFeatureWall } from '@/runtime/browser-feature-wall-actions'

type FeatureWallOwner = {
  skill: InstalledAgentSkillState
  installDisabled: boolean
  runtimeIdentity: object
  installIntent: () => Promise<void>
}
export function useBrowserFeatureWallOwner(owner: FeatureWallOwner): void {
  const runtimeTarget = useActiveSkillDiscoveryRuntimeTarget()
  const current = useRef({ ...owner, runtimeTarget })
  current.current = { ...owner, runtimeTarget }
  const pending = useRef<BrowserFeatureWallEvent | null>(null)
  const receipt = useRef<(() => boolean) | undefined>(undefined)
  const ready = useRef(false)
  const [, publishCompletion] = useState(0)
  const finishCommitted = (): void => {
    const request = pending.current
    if (!request || !ready.current || request.isSettled()) {
      return
    }
    pending.current = null
    try {
      requireBrowserFeatureWall(request.command)
      const { skill } = current.current
      if (Date.now() >= request.expiresAt || !receipt.current?.()) {
        throw new Error('browser_feature_wall_effect_unknown')
      }
      if (
        request.command.action === 'recheck' &&
        (skill.loading || !skill.settled || skill.error || skill.installedUnverifiable)
      ) {
        throw new Error('browser_feature_wall_scan_unverifiable')
      }
      request.finish(
        undefined,
        BrowserFeatureWallState.parse({
          installed: skill.installed,
          loading: skill.loading,
          settled: skill.settled,
          unverifiable: skill.installedUnverifiable || skill.error !== null,
          browserUseEnabled: localStorage.getItem(BROWSER_USE_ENABLED_STORAGE_KEY) === '1',
          interactionRecorded:
            (useAppStore.getState().featureInteractions['agent-browser-setup']?.interactionCount ??
              0) > 0
        })
      )
    } catch {
      request.finish(new Error('browser_feature_wall_effect_unknown'))
    }
  }
  useEffect(finishCommitted)
  useEffect(() => {
    const receive = (event: WindowEventMap[typeof BROWSER_FEATURE_WALL_EVENT]): void => {
      const request = event.detail
      if (!BrowserFeatureWallCommand.safeParse(request.command).success) {
        return
      }
      request.offer(() => {
        try {
          requireBrowserFeatureWall(request.command)
          if (request.isSettled() || Date.now() >= request.expiresAt) {
            throw new Error('browser_feature_wall_request_expired')
          }
          if (pending.current && !pending.current.isSettled()) {
            throw new Error('browser_feature_wall_request_busy')
          }
          const initial = current.current
          const interactionCount =
            useAppStore.getState().featureInteractions['agent-browser-setup']?.interactionCount ?? 0
          if (initial.runtimeTarget?.kind !== 'local') {
            throw new Error('browser_feature_wall_runtime_mismatch')
          }
          if (request.command.action === 'install-intent' && initial.installDisabled) {
            throw new Error('browser_feature_wall_install_disabled')
          }
          pending.current = request
          ready.current = false
          receipt.current = undefined
          const identity = (): boolean =>
            current.current.runtimeIdentity === initial.runtimeIdentity &&
            current.current.runtimeTarget === initial.runtimeTarget
          const perform = async (): Promise<void> => {
            let resultReceipt: () => boolean
            if (request.command.action === 'recheck') {
              if (!initial.skill.refreshWithReceipt) {
                throw new Error('browser_feature_wall_receipt_unavailable')
              }
              const scan = await initial.skill.refreshWithReceipt()
              resultReceipt = () => identity() && scan?.() === true
            } else {
              if (request.command.action === 'install-intent') {
                await initial.installIntent()
              }
              resultReceipt = () =>
                identity() &&
                (request.command.action !== 'install-intent' ||
                  (localStorage.getItem(BROWSER_USE_ENABLED_STORAGE_KEY) === '1' &&
                    (useAppStore.getState().featureInteractions['agent-browser-setup']
                      ?.interactionCount ?? 0) > interactionCount))
            }
            if (pending.current !== request || request.isSettled()) {
              return
            }
            receipt.current = resultReceipt
            ready.current = true
            publishCompletion((value) => value + 1)
          }
          void perform().catch(() =>
            request.finish(new Error('browser_feature_wall_effect_unknown'))
          )
        } catch (error) {
          request.finish(
            error instanceof Error ? error : new Error('browser_feature_wall_action_failed')
          )
        }
      })
    }
    window.addEventListener(BROWSER_FEATURE_WALL_EVENT, receive)
    return () => {
      pending.current?.finish(new Error('browser_feature_wall_owner_changed_effect_unknown'))
      pending.current = null
      window.removeEventListener(BROWSER_FEATURE_WALL_EVENT, receive)
    }
  }, [])
}
