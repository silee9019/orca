import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ManagedSkillViewerActionSchema,
  type ManagedSkillViewerAction
} from '../../../shared/managed-skill-viewer-command'
import type { SkillCloudPackageDetails } from '../../../shared/skill-cloud-contract'
import type { SkillInstallResult } from '../../../shared/skill-install-contract'
import type { SkillBundleInstallResult } from '../../../shared/skill-bundle-install-contract'
import type { SkillManagedInstallGroup } from '../components/skills/skill-managed-install-groups'

type Form = {
  open: boolean
  environmentId: string
  ownerKey: string | undefined
  ownerRevisions: ReadonlyMap<string, string>
  availableEnvironments: readonly string[]
  setEnvironmentId: (value: string) => void
  inventoryReady: boolean
  groups: readonly SkillManagedInstallGroup[]
  selectedKey: string
  details: SkillCloudPackageDetails | null
  versionId: string
  setVersionId: (value: string) => void
  busy: boolean
  confirmRemove: boolean
  result: SkillInstallResult | null
  bundleResult: SkillBundleInstallResult | null
  error: string | null
  notice: string | null
  activeOperationId: string | null
  selectInstall: (group: SkillManagedInstallGroup) => Promise<void>
  collapse: () => void
  load: () => Promise<void>
  installVersion: (discardLocal: boolean) => Promise<void>
  remove: (discardLocal: boolean) => Promise<void>
  cancelInstall: () => Promise<void>
  close: () => void
  sendToMachine: (shareId: string) => void
}
function snapshot(form: Form, closed = !form.open) {
  return {
    viewer: 'desktop' as const,
    committed: true as const,
    closed,
    environmentId: form.environmentId,
    inventoryReady: form.inventoryReady,
    groups: form.groups,
    selectedKey: form.selectedKey,
    versionIds: form.details?.versions.map((version) => version.versionId) ?? [],
    versionId: form.versionId,
    busy: form.busy,
    confirmRemove: form.confirmRemove,
    result: form.result,
    bundleResult: form.bundleResult,
    error: form.error,
    notice: form.notice,
    activeOperationId: form.activeOperationId,
    canSendToMachine: Boolean(form.details?.management?.shares[0])
  }
}
export type ManagedSkillViewerState = ReturnType<typeof snapshot>
type Control = (action: ManagedSkillViewerAction) => Promise<ManagedSkillViewerState>
const mountedForms = new Set<Control>()
export async function applyManagedSkillViewerAction(
  action: ManagedSkillViewerAction
): Promise<ManagedSkillViewerState> {
  const parsed = ManagedSkillViewerActionSchema.parse(action)
  if (mountedForms.size !== 1) {
    throw new Error(mountedForms.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mountedForms.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control(parsed)
}
export function useManagedSkillViewerController(form: Form): void {
  const latest = useRef(form)
  const activeOwner = useRef({ id: form.activeOperationId, ownerKey: form.ownerKey })
  useLayoutEffect(() => {
    latest.current = form
    if (activeOwner.current.id !== form.activeOperationId) {
      activeOwner.current = { id: form.activeOperationId, ownerKey: form.ownerKey }
    }
  })
  const [, setRevision] = useState(0)
  type Request = {
    environmentId: string
    ownerKey: string | undefined
    ready: boolean
    inventory?: boolean
    close?: boolean
    resolve: (state: ManagedSkillViewerState) => void
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
      if (request.close && !form.open) {
        slot.current = null
        request.resolve(snapshot(form, true))
      } else if (
        !form.open ||
        request.environmentId !== form.environmentId ||
        request.ownerKey !== form.ownerKey
      ) {
        slot.current = null
        request.reject(new Error('viewer_target_changed'))
      } else if (request.ready && (!request.inventory || !form.busy)) {
        if (request.inventory && !form.inventoryReady) {
          if (!form.error) {
            continue
          }
          slot.current = null
          request.reject(new Error('managed_skill_inventory_failed'))
        } else {
          slot.current = null
          request.resolve(snapshot(form))
        }
      }
    }
  })
  useEffect(() => {
    const control: Control = async (action) => {
      const current = latest.current
      if (action.kind === 'get') {
        return snapshot(current)
      }
      const cancelling = action.kind === 'cancel'
      if (cancelling) {
        if (cancellation.current) {
          throw new Error('viewer_busy')
        }
        if (current.activeOperationId && activeOwner.current.ownerKey !== current.ownerKey) {
          throw new Error('viewer_target_changed')
        }
        if (!current.activeOperationId) {
          throw new Error('skill_installation_not_active')
        }
      } else if (pending.current || cancellation.current || current.busy) {
        throw new Error('viewer_busy')
      }
      const group = current.groups.find((candidate) => candidate.key === current.selectedKey)
      if (action.kind === 'environment' && !current.availableEnvironments.includes(action.value)) {
        throw new Error('skill_environment_unavailable')
      }
      if (
        !['environment', 'refresh', 'close', 'cancel'].includes(action.kind) &&
        !current.inventoryReady
      ) {
        throw new Error('managed_skill_inventory_unavailable')
      }
      const selected =
        action.kind === 'select' && action.key !== null
          ? current.groups.find((candidate) => candidate.key === action.key)
          : undefined
      if (action.kind === 'select' && action.key !== null && !selected) {
        throw new Error('managed_skill_not_loaded')
      }
      if (
        (action.kind === 'version' || action.kind === 'install') &&
        (!group ||
          !current.details?.versions.some(
            (version) =>
              version.versionId === (action.kind === 'version' ? action.value : current.versionId)
          ))
      ) {
        throw new Error('managed_skill_version_not_loaded')
      }
      if (action.kind === 'remove' && !group) {
        throw new Error('managed_skill_not_loaded')
      }
      if (
        (action.kind === 'install' || action.kind === 'remove') &&
        action.discardLocal &&
        current.result?.status !== 'conflict' &&
        !group?.installs.some((install) => install.state === 'modified')
      ) {
        throw new Error('skill_conflict_decision_unavailable')
      }
      const share = current.details?.management?.shares[0]
      if (action.kind === 'send-to-machine' && !share) {
        throw new Error('managed_skill_share_unavailable')
      }
      return new Promise((resolve, reject) => {
        const slot = cancelling ? cancellation : pending
        const request: Request = {
          environmentId: action.kind === 'environment' ? action.value : current.environmentId,
          ownerKey: current.ownerRevisions.get(
            action.kind === 'environment' ? action.value : current.environmentId
          ),
          ready: false,
          resolve,
          reject,
          inventory: action.kind === 'environment' || action.kind === 'refresh',
          close: action.kind === 'close' || action.kind === 'send-to-machine'
        }
        slot.current = request
        let operation: Promise<void> | undefined
        switch (action.kind) {
          case 'environment':
            current.setEnvironmentId(action.value)
            break
          case 'select':
            if (selected) {
              operation = current.selectInstall(selected)
            } else {
              current.collapse()
            }
            break
          case 'version':
            current.setVersionId(action.value)
            break
          case 'refresh':
            operation = current.load()
            break
          case 'install':
            operation = current.installVersion(action.discardLocal)
            break
          case 'remove':
            operation = current.remove(action.discardLocal)
            break
          case 'cancel':
            operation = current.cancelInstall()
            break
          case 'close':
            current.close()
            break
          case 'send-to-machine':
            if (share) {
              current.sendToMachine(share.id)
            }
            break
        }
        void Promise.resolve(operation).then(
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
            reject(error instanceof Error ? error : new Error('managed_skill_action_failed'))
          }
        )
      })
    }
    if (!form.open) {
      return
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
  }, [form.open])
}
