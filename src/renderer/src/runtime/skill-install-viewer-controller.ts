import {
  applySkillInstallViewerTarget,
  validateSkillInstallViewerTarget,
  type SkillInstallViewerTarget
} from './skill-install-viewer-target'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  SkillInstallViewerActionSchema,
  SkillInstallTargetViewerActionSchema,
  type SkillInstallViewerAction
} from '../../../shared/skill-install-viewer-command'
import type {
  SkillInstallPreview,
  SkillInstallResult
} from '../../../shared/skill-install-contract'
import {
  isSkillBundleVersion,
  type ResolvedSkillShare
} from '../components/skills/skill-share-version-summary'

type Form = SkillInstallViewerTarget & {
  open: boolean
  busy: boolean
  resolvingInitialLink: boolean
  link: string
  setLink: (value: string) => void
  inspect: () => Promise<void>
  install: (discardLocal: boolean) => Promise<void>
  cancelInstall: () => Promise<void>
  activeOperationId: string | null
  preview: ResolvedSkillShare | null
  destinationPreview: SkillInstallPreview | null
  result: SkillInstallResult | null
  error: string | null
}
function snapshot(form: Form) {
  return {
    viewer: 'desktop' as const,
    committed: true as const,
    link: form.link,
    preview: form.preview,
    destinationPreview: form.destinationPreview,
    result: form.result,
    error: form.error,
    busy: form.busy,
    activeOperationId: form.activeOperationId,
    environmentId: form.environmentId,
    scope: form.scope,
    workspace: form.workspace,
    executionTarget: form.executionTarget,
    providers: [...form.providers]
  }
}
export type SkillInstallViewerState = ReturnType<typeof snapshot>
type Control = (action: SkillInstallViewerAction) => Promise<SkillInstallViewerState>
const mountedForms = new Set<Control>()
export async function applySkillInstallViewerAction(
  action: SkillInstallViewerAction
): Promise<SkillInstallViewerState> {
  const parsed = SkillInstallViewerActionSchema.parse(action)
  if (mountedForms.size !== 1) {
    throw new Error(mountedForms.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mountedForms.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control(parsed)
}
export function useSkillInstallViewerController(form: Form): void {
  const latest = useRef(form)
  useLayoutEffect(() => {
    latest.current = form
  })
  const [, setRevision] = useState(0)
  type Request = {
    environmentId: string
    ownerRevision: string | undefined
    ready: boolean
    resolve: (state: SkillInstallViewerState) => void
    reject: (error: Error) => void
  }
  const pending = useRef<Request | null>(null)
  const cancellation = useRef<Request | null>(null)
  useEffect(() => {
    for (const slot of [pending, cancellation]) {
      const request = slot.current
      if (!request) {
        continue
      }
      if (
        !form.open ||
        form.environmentId !== request.environmentId ||
        form.ownerRevisions.get(request.environmentId) !== request.ownerRevision
      ) {
        slot.current = null
        request.reject(new Error('viewer_target_changed'))
      } else if (request.ready) {
        slot.current = null
        request.resolve(snapshot(form))
      }
    }
  })
  useEffect(() => {
    if (!form.open) {
      return
    }
    const begin = (
      operation: () => Promise<void>,
      cancelling = false
    ): Promise<SkillInstallViewerState> =>
      new Promise((resolve, reject) => {
        const slot = cancelling ? cancellation : pending
        const request = {
          environmentId: latest.current.environmentId,
          ownerRevision: latest.current.ownerRevisions.get(latest.current.environmentId),
          ready: false,
          resolve,
          reject
        }
        slot.current = request
        void Promise.resolve()
          .then(() => {
            if (
              slot.current !== request ||
              !latest.current.open ||
              latest.current.environmentId !== request.environmentId ||
              latest.current.ownerRevisions.get(request.environmentId) !== request.ownerRevision
            ) {
              throw new Error('viewer_target_changed')
            }
            return operation()
          })
          .then(
            () => {
              if (slot.current !== request) {
                return
              }
              request.ready = true
              setRevision((value) => value + 1)
            },
            (error: unknown) => {
              if (slot.current !== request) {
                return
              }
              slot.current = null
              reject(error instanceof Error ? error : new Error('skill_install_action_failed'))
            }
          )
      })
    const control: Control = async (action) => {
      const current = latest.current
      if (action.kind === 'get') {
        return snapshot(current)
      }
      if (action.kind === 'cancel') {
        if (cancellation.current) {
          throw new Error('viewer_busy')
        }
        if (!current.busy || !current.activeOperationId) {
          throw new Error('skill_installation_not_active')
        }
        return begin(current.cancelInstall, true)
      }
      if (pending.current || cancellation.current || current.busy || current.resolvingInitialLink) {
        throw new Error('viewer_busy')
      }
      if (action.kind === 'link' || action.kind === 'inspect') {
        if (current.preview) {
          throw new Error('skill_link_input_unavailable')
        }
      } else if (
        !current.preview ||
        isSkillBundleVersion(current.preview.version) ||
        (current.result &&
          !['conflict', 'partial', 'failed', 'cancelled'].includes(current.result.status))
      ) {
        throw new Error('skill_target_input_unavailable')
      }
      if (action.kind === 'inspect' && !current.link.trim()) {
        throw new Error('skill_link_input_unavailable')
      }
      if (action.kind === 'inspect') {
        return begin(current.inspect)
      }
      if (action.kind === 'install') {
        if (!current.availableEnvironments.includes(current.environmentId)) {
          throw new Error('skill_environment_unavailable')
        }
        if (
          current.scope === 'workspace' &&
          !current.availableWorkspaces.includes(current.workspace)
        ) {
          throw new Error('skill_workspace_unavailable')
        }
        if (
          action.discardLocal &&
          current.result?.status !== 'conflict' &&
          !['modified', 'unowned', 'external-link', 'name-collision'].includes(
            current.destinationPreview?.currentState ?? ''
          )
        ) {
          throw new Error('skill_conflict_decision_unavailable')
        }
        return begin(() => current.install(action.discardLocal))
      }
      const target = SkillInstallTargetViewerActionSchema.safeParse(action)
      if (target.success) {
        await validateSkillInstallViewerTarget(current, target.data)
        if (
          pending.current ||
          cancellation.current ||
          !latest.current.open ||
          latest.current.busy ||
          latest.current.environmentId !== current.environmentId ||
          latest.current.scope !== current.scope ||
          latest.current.ownerRevisions.get(current.environmentId) !==
            current.ownerRevisions.get(current.environmentId)
        ) {
          throw new Error('viewer_target_changed')
        }
        return new Promise((resolve, reject) => {
          const environmentId =
            target.data.kind === 'environment' ? target.data.value : current.environmentId
          pending.current = {
            environmentId,
            ownerRevision: current.ownerRevisions.get(environmentId),
            ready: true,
            resolve,
            reject
          }
          applySkillInstallViewerTarget(current, target.data)
          setRevision((value) => value + 1)
        })
      }
      return new Promise((resolve, reject) => {
        pending.current = {
          environmentId: current.environmentId,
          ownerRevision: current.ownerRevisions.get(current.environmentId),
          ready: true,
          resolve,
          reject
        }
        if (action.kind === 'link') {
          current.setLink(action.value)
        }
        setRevision((value) => value + 1)
      })
    }
    mountedForms.add(control)
    return () => {
      mountedForms.delete(control)
      for (const slot of [pending, cancellation]) {
        slot.current?.reject(new Error('viewer_unmounted'))
        slot.current = null
      }
    }
  }, [form.open])
}
