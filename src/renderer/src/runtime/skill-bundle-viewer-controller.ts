import { updatedSkillSelection } from '../components/skills/skill-share-selection'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  SkillBundleViewerActionSchema,
  type SkillBundleViewerAction
} from '../../../shared/skill-bundle-viewer-command'
import { SkillInstallTargetViewerActionSchema } from '../../../shared/skill-install-viewer-command'
import type {
  SkillBundleInstallPreview,
  SkillBundleInstallResult
} from '../../../shared/skill-bundle-install-contract'
import {
  applySkillInstallViewerTarget,
  validateSkillInstallViewerTarget,
  type SkillInstallViewerTarget
} from './skill-install-viewer-target'

type Form = SkillInstallViewerTarget & {
  identity: string
  skillIds: readonly string[]
  selectedSkillIds: ReadonlySet<string>
  replaceSkillIds: ReadonlySet<string>
  setSelectedSkillIds: (value: Set<string>) => void
  setReplaceSkillIds: (value: Set<string>) => void
  destinationPreview: SkillBundleInstallPreview | null
  result: SkillBundleInstallResult | null
  retryIds: ReadonlySet<string>
  busy: boolean
  error: string | null
  activeOperationId: string | null
  install: (requestedIds?: ReadonlySet<string>, reusePreview?: boolean) => Promise<void>
  cancelInstall: () => Promise<void>
  close: () => void
}
function snapshot(form: Form, closed = false) {
  return {
    viewer: 'desktop' as const,
    committed: true as const,
    closed,
    skillIds: form.skillIds,
    selectedSkillIds: [...form.selectedSkillIds],
    replaceSkillIds: [...form.replaceSkillIds],
    destinationPreview: form.destinationPreview,
    result: form.result,
    busy: form.busy,
    error: form.error,
    activeOperationId: form.activeOperationId,
    environmentId: form.environmentId,
    scope: form.scope,
    workspace: form.workspace,
    executionTarget: form.executionTarget,
    providers: [...form.providers]
  }
}
export type SkillBundleViewerState = ReturnType<typeof snapshot>
type Control = (action: SkillBundleViewerAction) => Promise<SkillBundleViewerState>
const mountedForms = new Set<Control>()
export async function applySkillBundleViewerAction(
  action: SkillBundleViewerAction
): Promise<SkillBundleViewerState> {
  const parsed = SkillBundleViewerActionSchema.parse(action)
  if (mountedForms.size !== 1) {
    throw new Error(mountedForms.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mountedForms.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control(parsed)
}
export function useSkillBundleViewerController(form: Form): void {
  const latest = useRef(form)
  useLayoutEffect(() => {
    latest.current = form
  })
  const [, setRevision] = useState(0)
  type Request = {
    identity: string
    environmentId: string
    ownerRevision: string | undefined
    ready: boolean
    close?: boolean
    resolve: (state: SkillBundleViewerState) => void
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
        request.identity !== form.identity ||
        request.environmentId !== form.environmentId ||
        request.ownerRevision !== form.ownerRevisions.get(request.environmentId)
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
    const requestState = (
      current: Form,
      resolve: Request['resolve'],
      reject: Request['reject']
    ): Request => ({
      identity: current.identity,
      environmentId: current.environmentId,
      ownerRevision: current.ownerRevisions.get(current.environmentId),
      ready: false,
      resolve,
      reject
    })
    const begin = (
      operation: () => Promise<void>,
      cancelling = false
    ): Promise<SkillBundleViewerState> =>
      new Promise((resolve, reject) => {
        const slot = cancelling ? cancellation : pending
        const request = requestState(latest.current, resolve, reject)
        slot.current = request
        void Promise.resolve()
          .then(() => {
            const current = latest.current
            if (
              slot.current !== request ||
              current.identity !== request.identity ||
              current.environmentId !== request.environmentId ||
              current.ownerRevisions.get(request.environmentId) !== request.ownerRevision
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
              reject(error instanceof Error ? error : new Error('skill_bundle_action_failed'))
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
      if (pending.current || cancellation.current || current.busy) {
        throw new Error('viewer_busy')
      }
      if (action.kind === 'close') {
        return new Promise((resolve, reject) => {
          pending.current = { ...requestState(current, resolve, reject), close: true }
          current.close()
        })
      }
      if (action.kind === 'retry') {
        if (!current.result || !current.retryIds.size) {
          throw new Error('skill_bundle_retry_unavailable')
        }
        return begin(() => current.install(current.retryIds, false))
      }
      if (current.result) {
        throw new Error('skill_bundle_input_unavailable')
      }
      if (action.kind === 'select' && !current.skillIds.includes(action.id)) {
        throw new Error('skill_not_in_bundle')
      }
      if (
        action.kind === 'replace' &&
        (!current.selectedSkillIds.has(action.id) ||
          !current.destinationPreview?.skills.some(
            (skill) =>
              skill.id === action.id &&
              ['modified', 'unowned', 'external-link', 'name-collision'].includes(
                skill.currentState
              )
          ))
      ) {
        throw new Error('skill_conflict_decision_unavailable')
      }
      if (action.kind === 'install') {
        if (!current.selectedSkillIds.size) {
          throw new Error('skill_selection_unavailable')
        }
        if (!current.availableEnvironments.includes(current.environmentId)) {
          throw new Error('skill_environment_unavailable')
        }
        if (
          current.scope === 'workspace' &&
          !current.availableWorkspaces.includes(current.workspace)
        ) {
          throw new Error('skill_workspace_unavailable')
        }
        return begin(() => current.install())
      }
      const target = SkillInstallTargetViewerActionSchema.safeParse(action)
      if (target.success) {
        await validateSkillInstallViewerTarget(current, target.data)
        if (
          pending.current ||
          cancellation.current ||
          latest.current.busy ||
          latest.current.identity !== current.identity ||
          latest.current.environmentId !== current.environmentId ||
          latest.current.scope !== current.scope ||
          latest.current.ownerRevisions.get(current.environmentId) !==
            current.ownerRevisions.get(current.environmentId)
        ) {
          throw new Error('viewer_target_changed')
        }
      }
      return new Promise((resolve, reject) => {
        const request = requestState(current, resolve, reject)
        request.ready = true
        if (target.success && target.data.kind === 'environment') {
          request.environmentId = target.data.value
          request.ownerRevision = current.ownerRevisions.get(target.data.value)
        }
        pending.current = request
        if (target.success) {
          applySkillInstallViewerTarget(current, target.data)
        } else if (action.kind === 'select') {
          current.setSelectedSkillIds(
            updatedSkillSelection(current.selectedSkillIds, action.id, action.selected)
          )
          current.clearDestinationPreview()
        } else if (action.kind === 'select-all') {
          current.setSelectedSkillIds(new Set(action.selected ? current.skillIds : []))
          current.clearDestinationPreview()
        } else if (action.kind === 'replace') {
          current.setReplaceSkillIds(
            updatedSkillSelection(current.replaceSkillIds, action.id, action.replace)
          )
        }
        setRevision((value) => value + 1)
      })
    }
    mountedForms.add(control)
    return () => {
      mountedForms.delete(control)
      for (const slot of [pending, cancellation]) {
        const request = slot.current
        if (request?.close) {
          request.resolve(snapshot(latest.current, true))
        } else {
          request?.reject(new Error('viewer_unmounted'))
        }
        slot.current = null
      }
    }
  }, [])
}
