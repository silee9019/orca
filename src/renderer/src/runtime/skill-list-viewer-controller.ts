import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  SkillListViewerActionSchema,
  type SkillListViewerAction
} from '../../../shared/skill-list-viewer-command'
import type { DiscoveredSkill } from '../../../shared/skills'
import type { RuntimeClientTarget } from './runtime-client-target'
import { isSkillShareEligible } from '../components/skills/skill-share-selection'
import { copySkillPath, revealSkillFile } from '../components/skills/skill-file-actions'

type Form = {
  target: RuntimeClientTarget | null | undefined
  locked: boolean
  busy: boolean
  local: boolean
  skills: readonly DiscoveredSkill[]
  selectedIds: ReadonlySet<string>
  selectionMode: 'share' | 'delete' | null
  detailSkill: DiscoveredSkill | null
  setDetailSkill: (value: DiscoveredSkill | null) => void
  focusedId: string | null
  canSelect: (skill: DiscoveredSkill) => boolean
  handleSelection: (index: number, selected: boolean, range: boolean) => void
  share: (skill: DiscoveredSkill) => void
  focus: (value: 'next' | 'previous' | 'first' | 'last' | 'id', id?: string) => void
}
function snapshot(form: Form) {
  return {
    viewer: 'desktop' as const,
    committed: true as const,
    target: form.target,
    visibleSkillIds: form.skills.map((skill) => skill.id),
    selectedSkillIds: [...form.selectedIds],
    selectionMode: form.selectionMode,
    busy: form.busy,
    detailSkill: form.detailSkill,
    focusedId: form.focusedId
  }
}
type ViewerState = ReturnType<typeof snapshot> & {
  revealResult?: Awaited<ReturnType<typeof revealSkillFile>>
}
export type SkillListViewerState = ViewerState
type Control = (action: SkillListViewerAction) => Promise<ViewerState>
const mountedLists = new Set<Control>()
export async function applySkillListViewerAction(
  action: SkillListViewerAction
): Promise<ViewerState> {
  const parsed = SkillListViewerActionSchema.parse(action)
  if (mountedLists.size !== 1) {
    throw new Error(mountedLists.size ? 'viewer_ambiguous' : 'viewer_unavailable')
  }
  const control = mountedLists.values().next().value
  if (!control) {
    throw new Error('viewer_unavailable')
  }
  return control(parsed)
}
export function useSkillListViewerController(form: Form): void {
  const latest = useRef(form)
  useLayoutEffect(() => {
    latest.current = form
  })
  const [, setRevision] = useState(0)
  type Request = {
    target: Form['target']
    ready: boolean
    revealResult?: ViewerState['revealResult']
    resolve: (state: ViewerState) => void
    reject: (error: Error) => void
  }
  const pending = useRef<Request | null>(null)
  useEffect(() => {
    const request = pending.current
    if (!request) {
      return
    }
    if (request.target !== form.target) {
      pending.current = null
      request.reject(new Error('viewer_target_changed'))
    } else if (request.ready) {
      pending.current = null
      request.resolve({
        ...snapshot(form),
        ...(request.revealResult ? { revealResult: request.revealResult } : {})
      })
    }
  })
  useEffect(() => {
    const control: Control = async (action) => {
      const current = latest.current
      if (action.kind === 'get') {
        return snapshot(current)
      }
      if (pending.current) {
        throw new Error('viewer_busy')
      }
      if (current.busy) {
        throw new Error('viewer_busy')
      }
      if (current.locked) {
        throw new Error('viewer_modal_open')
      }
      if (
        current.detailSkill &&
        action.kind !== 'detail-action' &&
        !(action.kind === 'detail' && action.id === null)
      ) {
        throw new Error('viewer_modal_open')
      }
      const id = 'id' in action ? action.id : null
      const index = current.skills.findIndex((skill) => skill.id === id)
      const skill = action.kind === 'detail-action' ? current.detailSkill : current.skills[index]
      if (id !== null && !skill) {
        throw new Error('skill_not_visible')
      }
      if (action.kind === 'detail-action' && !skill) {
        throw new Error('skill_detail_unavailable')
      }
      if (action.kind === 'select' || (action.kind === 'activate' && current.selectionMode)) {
        if (!current.selectionMode || !skill || !current.canSelect(skill)) {
          throw new Error('skill_selection_ineligible')
        }
      }
      if (
        (action.kind === 'share' ||
          (action.kind === 'detail-action' && action.action === 'share')) &&
        (!skill || !isSkillShareEligible(skill, current.local))
      ) {
        throw new Error('skill_selection_ineligible')
      }
      if (action.kind === 'detail-action' && action.action === 'reveal' && !current.local) {
        throw new Error('skill_reveal_remote_unsupported')
      }
      return new Promise((resolve, reject) => {
        const request: Request = { target: current.target, ready: false, resolve, reject }
        pending.current = request
        let operation: Promise<unknown> | undefined
        if (action.kind === 'detail') {
          current.setDetailSkill(skill ?? null)
        } else if (action.kind === 'focus') {
          current.focus(action.value)
        } else if (action.kind === 'focus-id') {
          current.focus('id', action.id)
        } else if (action.kind === 'select') {
          current.handleSelection(index, action.selected, action.range)
        } else if (action.kind === 'activate' && skill) {
          if (current.selectionMode) {
            current.handleSelection(index, !current.selectedIds.has(skill.id), action.range)
          } else {
            current.setDetailSkill(skill)
          }
        } else if (action.kind === 'share' && skill) {
          current.share(skill)
        } else if (action.kind === 'detail-action' && skill) {
          if (action.action === 'close') {
            current.setDetailSkill(null)
          } else if (action.action === 'share') {
            current.share(skill)
          } else if (action.action === 'copy-path') {
            operation = copySkillPath(skill.skillFilePath)
          } else {
            operation = revealSkillFile(skill.skillFilePath).then((result) => {
              request.revealResult = result
            })
          }
        }
        void Promise.resolve(operation).then(
          () => {
            if (pending.current !== request) {
              return
            }
            request.ready = true
            setRevision((value) => value + 1)
          },
          (error: unknown) => {
            if (pending.current !== request) {
              return
            }
            pending.current = null
            reject(error instanceof Error ? error : new Error('skill_list_action_failed'))
          }
        )
      })
    }
    mountedLists.add(control)
    return () => {
      mountedLists.delete(control)
      pending.current?.reject(new Error('viewer_unmounted'))
      pending.current = null
    }
  }, [])
}
