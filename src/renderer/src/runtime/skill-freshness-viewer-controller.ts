import { isSkillsViewerDialogOpen } from './skills-viewer-dialog'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  SkillFreshnessViewerActionSchema,
  type SkillFreshnessViewerAction
} from '../../../shared/skill-freshness-viewer-command'
import type {
  SkillFreshnessInventory,
  SkillUpdateRun,
  SkillUpdateStartResult
} from '../../../shared/skill-freshness'

type Form = {
  open: boolean
  localInventoryAvailable: boolean
  inventory: SkillFreshnessInventory | null
  loading: boolean
  error: string | null
  run: SkillUpdateRun
  copied: boolean
  openDialog: () => void
  closeDialog: () => Promise<boolean>
  refresh: () => Promise<void>
  update: (names: readonly string[]) => Promise<SkillUpdateStartResult | null>
  stop: () => Promise<boolean>
  copyCommand: () => Promise<boolean>
}
function snapshot(form: Form) {
  return {
    viewer: 'desktop' as const,
    committed: true as const,
    executionHost: 'local' as const,
    open: form.open,
    localInventoryAvailable: form.localInventoryAvailable,
    inventory: form.inventory,
    eligibleNames: form.inventory?.eligibleUpdateNames ?? [],
    loading: form.loading,
    error: form.error,
    run: form.run,
    copied: form.copied
  }
}
export type SkillFreshnessViewerState = ReturnType<typeof snapshot> & { accepted?: boolean }
type Control = (action: SkillFreshnessViewerAction) => Promise<SkillFreshnessViewerState>
const mountedDialogs = new Set<Control>()
export async function applySkillFreshnessViewerAction(
  action: SkillFreshnessViewerAction
): Promise<SkillFreshnessViewerState> {
  const parsed = SkillFreshnessViewerActionSchema.parse(action)
  if (mountedDialogs.size !== 1) {
    throw new Error(mountedDialogs.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mountedDialogs.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control(parsed)
}
export function useSkillFreshnessViewerController(form: Form): void {
  const latest = useRef(form)
  useLayoutEffect(() => {
    latest.current = form
  })
  const [, setRevision] = useState(0)
  type Request = {
    ready: boolean
    refresh: boolean
    accepted?: boolean
    resolve: (state: SkillFreshnessViewerState) => void
    reject: (error: Error) => void
  }
  const pending = useRef<Request | null>(null)
  const interrupt = useRef<Request | null>(null)
  useEffect(() => {
    for (const slot of [pending, interrupt]) {
      const request = slot.current
      if (!request?.ready || (request.refresh && form.loading)) {
        continue
      }
      slot.current = null
      if (request.refresh && (form.error || !form.localInventoryAvailable || !form.inventory)) {
        request.reject(new Error('skill_freshness_refresh_failed'))
      } else {
        request.resolve({
          ...snapshot(form),
          ...(request.accepted === undefined ? {} : { accepted: request.accepted })
        })
      }
    }
  })
  useEffect(() => {
    const control: Control = async (action) => {
      const current = latest.current
      if (action.kind === 'get') {
        return snapshot(current)
      }
      if (
        isSkillsViewerDialogOpen('install') ||
        isSkillsViewerDialogOpen('management') ||
        isSkillsViewerDialogOpen('share') ||
        isSkillsViewerDialogOpen('detail')
      ) {
        throw new Error('viewer_modal_open')
      }
      const interrupting = action.kind === 'stop' || (action.kind === 'open' && !action.value)
      const slot = interrupting ? interrupt : pending
      if (slot.current || (!interrupting && interrupt.current)) {
        throw new Error('viewer_busy')
      }
      if (action.kind !== 'open' && !current.open) {
        throw new Error('skill_freshness_dialog_closed')
      }
      if (action.kind === 'stop' && (current.run.state !== 'running' || current.run.stopping)) {
        throw new Error('skill_update_not_stoppable')
      }
      if (action.kind === 'refresh' || action.kind === 'update') {
        if (!current.localInventoryAvailable) {
          throw new Error('skill_freshness_local_inventory_unavailable')
        }
        if (current.loading) {
          throw new Error('viewer_busy')
        }
        if (current.run.state !== 'idle') {
          throw new Error('skill_update_run_active')
        }
      }
      const names =
        action.kind === 'retry' && current.run.state === 'error'
          ? current.run.failedNames
          : action.kind === 'update'
            ? (action.names ?? current.inventory?.eligibleUpdateNames ?? [])
            : []
      if (action.kind === 'retry' && (current.run.state !== 'error' || !names.length)) {
        throw new Error('skill_update_retry_unavailable')
      }
      if (
        action.kind === 'update' &&
        (!names.length ||
          new Set(names).size !== names.length ||
          names.some((name) => !current.inventory?.eligibleUpdateNames.includes(name)))
      ) {
        throw new Error('skill_update_name_ineligible')
      }
      if (action.kind === 'copy-command' && current.run.state !== 'error') {
        throw new Error('skill_update_command_unavailable')
      }
      return new Promise((resolve, reject) => {
        const request: Request = {
          ready: false,
          refresh: action.kind === 'refresh',
          resolve,
          reject
        }
        slot.current = request
        void (async () => {
          switch (action.kind) {
            case 'open':
              if (action.value) {
                current.openDialog()
              } else if (!(await current.closeDialog())) {
                throw new Error('skill_update_acknowledgement_failed')
              }
              break
            case 'refresh':
              await current.refresh()
              break
            case 'update':
            case 'retry': {
              const result = await current.update(names)
              if (!result?.started) {
                throw new Error(
                  result && !result.started
                    ? `skill_update_start_failed:${result.reason}`
                    : 'skill_update_start_failed'
                )
              }
              request.accepted = true
              break
            }
            case 'stop':
              if (!(await current.stop())) {
                throw new Error('skill_update_stop_failed')
              }
              request.accepted = true
              break
            case 'copy-command':
              if (!(await current.copyCommand())) {
                throw new Error('skill_update_copy_failed')
              }
              break
          }
        })().then(
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
            reject(error instanceof Error ? error : new Error('skill_freshness_action_failed'))
          }
        )
      })
    }
    mountedDialogs.add(control)
    return () => {
      mountedDialogs.delete(control)
      for (const slot of [pending, interrupt]) {
        slot.current?.reject(new Error('viewer_unmounted'))
        slot.current = null
      }
    }
  }, [])
}
