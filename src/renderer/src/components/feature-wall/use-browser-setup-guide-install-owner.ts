import { useEffect, useRef, useState } from 'react'
import { useActiveSkillDiscoveryRuntimeTarget } from '@/hooks/use-active-skill-discovery-runtime-target'
import { useAppStore } from '@/store'
import { BROWSER_USE_ENABLED_STORAGE_KEY } from '@/lib/browser-use-setup-state'
import { ORCHESTRATION_ENABLED_STORAGE_KEY } from '@/lib/orchestration-setup-state'
import {
  BrowserSetupGuideCommand,
  BrowserSetupGuideState
} from '../../../../shared/rpc-contract/browser-setup-guide-params'
import {
  BROWSER_SETUP_GUIDE_EVENT,
  type BrowserSetupGuideEvent
} from '@/runtime/browser-setup-guide-request'
import { requireBrowserSetupGuide } from '@/runtime/browser-setup-guide-actions'
export type BrowserSetupGuideInstallReceipt = {
  isCurrent: () => boolean
  clipboardCopied: boolean
  warningPresent: boolean
}
type BrowserSetupGuideInstallOwner = {
  busy: boolean
  isBusy: () => boolean
  commandPrepared: boolean
  installDisabled: boolean
  runtimeIdentity: object
  perform: (canApply?: () => boolean) => Promise<BrowserSetupGuideInstallReceipt | undefined>
}
export function useBrowserSetupGuideInstallOwner(owner: BrowserSetupGuideInstallOwner): void {
  const runtimeTarget = useActiveSkillDiscoveryRuntimeTarget()
  const current = useRef({ ...owner, runtimeTarget })
  current.current = { ...owner, runtimeTarget }
  const pending = useRef<BrowserSetupGuideEvent | null>(null)
  const ready = useRef(false)
  const receipt = useRef<BrowserSetupGuideInstallReceipt | undefined>(undefined)
  const [, publishCompletion] = useState(0)
  const finishCommitted = (): void => {
    const request = pending.current
    if (!request || !ready.current || request.isSettled()) {
      return
    }
    pending.current = null
    try {
      requireBrowserSetupGuide(request.command)
      if (Date.now() >= request.expiresAt) {
        throw new Error('browser_setup_guide_expired')
      }
      if (
        request.command.action === 'prepare-install' &&
        (!receipt.current?.isCurrent() || current.current.busy || current.current.isBusy())
      ) {
        throw new Error('browser_setup_guide_prepare_unacknowledged')
      }
      request.finish(
        undefined,
        BrowserSetupGuideState.parse({
          busy: current.current.busy || current.current.isBusy(),
          commandPrepared: current.current.commandPrepared,
          ...(receipt.current
            ? {
                clipboardCopied: receipt.current.clipboardCopied,
                warningPresent: receipt.current.warningPresent
              }
            : {}),
          browserUseEnabled: localStorage.getItem(BROWSER_USE_ENABLED_STORAGE_KEY) === '1',
          orchestrationEnabled: localStorage.getItem(ORCHESTRATION_ENABLED_STORAGE_KEY) === '1',
          interactionRecorded:
            (useAppStore.getState().featureInteractions['agent-browser-setup']?.interactionCount ??
              0) > 0
        })
      )
    } catch {
      request.finish(new Error('browser_setup_guide_effect_unknown'))
    }
  }
  useEffect(finishCommitted)
  useEffect(() => {
    const receive = (event: WindowEventMap[typeof BROWSER_SETUP_GUIDE_EVENT]): void => {
      const request = event.detail
      if (
        request.command.action === 'try-it' ||
        !BrowserSetupGuideCommand.safeParse(request.command).success
      ) {
        return
      }
      request.offer(() => {
        try {
          requireBrowserSetupGuide(request.command)
          if (request.isSettled() || Date.now() >= request.expiresAt) {
            throw new Error('browser_setup_guide_request_expired')
          }
          if (pending.current && !pending.current.isSettled()) {
            throw new Error('browser_setup_guide_request_busy')
          }
          const initial = current.current
          if (initial.runtimeTarget?.kind !== 'local') {
            throw new Error('browser_setup_guide_runtime_mismatch')
          }
          if (
            request.command.action === 'prepare-install' &&
            (initial.isBusy() || initial.commandPrepared || initial.installDisabled)
          ) {
            throw new Error('browser_setup_guide_prepare_busy_or_unavailable')
          }
          pending.current = request
          receipt.current = undefined
          ready.current = request.command.action === 'status'
          if (ready.current) {
            finishCommitted()
            return
          }
          const canApply = (): boolean => {
            try {
              requireBrowserSetupGuide(request.command)
              return (
                !request.isSettled() &&
                Date.now() < request.expiresAt &&
                current.current.runtimeIdentity === initial.runtimeIdentity &&
                current.current.runtimeTarget === initial.runtimeTarget
              )
            } catch {
              return false
            }
          }
          void initial
            .perform(canApply)
            .then((result) => {
              if (pending.current !== request || request.isSettled()) {
                return
              }
              receipt.current = result
              ready.current = true
              publishCompletion((value) => value + 1)
            })
            .catch(() => request.finish(new Error('browser_setup_guide_effect_unknown')))
        } catch (error) {
          request.finish(
            error instanceof Error ? error : new Error('browser_setup_guide_action_failed')
          )
        }
      })
    }
    window.addEventListener(BROWSER_SETUP_GUIDE_EVENT, receive)
    return () => {
      pending.current?.finish(new Error('browser_setup_guide_owner_changed_effect_unknown'))
      pending.current = null
      window.removeEventListener(BROWSER_SETUP_GUIDE_EVENT, receive)
    }
  }, [])
}
