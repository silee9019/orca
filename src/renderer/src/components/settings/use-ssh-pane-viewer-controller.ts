import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { SshTarget } from '../../../../shared/ssh-types'
import { EMPTY_FORM, getEditingTargetForSshTarget, type EditingTarget } from './ssh-target-draft'
import { useSshConnectionsViewerController } from '@/hooks/useSshConnectionsViewerController'
import {
  readSshAdvancedViewerState,
  type SshConnectionsViewerController
} from '@/runtime/ssh-connections-viewer-controller'
export function useSshPaneViewerController(
  state: {
    form: EditingTarget
    showForm: boolean
    editingId: string | null
    saving: boolean
    targets: SshTarget[]
  },
  setForm: Dispatch<SetStateAction<EditingTarget>>,
  setEditingId: Dispatch<SetStateAction<string | null>>,
  setShowForm: Dispatch<SetStateAction<boolean>>,
  save: () => Promise<boolean>,
  actions?: SshConnectionsViewerController['actions']
) {
  const openAddTargetForm = useCallback((): void => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }, [setEditingId, setForm, setShowForm])
  const handleEdit = (target: SshTarget): void => {
    setEditingId(target.id)
    setForm(getEditingTargetForSshTarget(target))
    setShowForm(true)
  }
  const cancelForm = (): void => {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }
  useSshConnectionsViewerController({
    read: () => ({
      formOpen: state.showForm,
      editingId: state.editingId,
      saving: state.saving,
      advancedOpen: readSshAdvancedViewerState(),
      configured: readSshFormConfigured(state.form)
    }),
    matchesDraft: (updates) =>
      Object.entries(updates).every(([key, value]) => Reflect.get(state.form, key) === value),
    open: openAddTargetForm,
    edit: (id) => {
      const target = state.targets.find((entry) => entry.id === id)
      if (!target) {
        return false
      }
      handleEdit(target)
      return true
    },
    cancel: cancelForm,
    draft: (updates) => setForm((current) => ({ ...current, ...updates })),
    save,
    ...(actions ? { actions } : {})
  })
  return { openAddTargetForm, handleEdit, cancelForm }
}

export function readSshFormConfigured(form: EditingTarget) {
  return {
    host: Boolean(form.host),
    username: Boolean(form.username),
    identityFile: Boolean(form.identityFile),
    proxyCommand: Boolean(form.proxyCommand),
    jumpHost: Boolean(form.jumpHost)
  }
}
