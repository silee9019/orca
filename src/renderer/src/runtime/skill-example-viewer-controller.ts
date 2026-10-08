import { useEffect, useRef } from 'react'
import { useAcknowledgedViewerToggle } from './use-acknowledged-viewer-toggle'

type ExampleActions = {
  change: (open: boolean) => Promise<{ open: boolean }>
  copy: () => Promise<boolean>
}
const exampleDialogs = new Map<string, Set<ExampleActions>>()
const exampleKey = (skillCommand: string, exampleId: string) =>
  JSON.stringify([skillCommand, exampleId])

export function useSkillExampleViewerController(
  skillCommand: string,
  exampleId: string,
  open: boolean,
  change: (open: boolean) => void,
  copy: () => Promise<boolean>
): void {
  const key = exampleKey(skillCommand, exampleId)
  const request = useAcknowledgedViewerToggle(open, change, key)
  const copyRef = useRef(copy)
  copyRef.current = copy
  useEffect(() => {
    const actions = { change: request, copy: () => copyRef.current() }
    const dialogs = exampleDialogs.get(key) ?? new Set<ExampleActions>()
    dialogs.add(actions)
    exampleDialogs.set(key, dialogs)
    return () => {
      dialogs.delete(actions)
      if (dialogs.size === 0) {
        exampleDialogs.delete(key)
      }
    }
  }, [key, request])
}

export async function applySkillExampleViewerAction(
  skillCommand: string,
  exampleId: string,
  operation: 'open' | 'close' | 'copy'
) {
  const dialogs = exampleDialogs.get(exampleKey(skillCommand, exampleId))
  if (!dialogs?.size) {
    throw new Error('skill_example_viewer_unavailable: open its settings section first')
  }
  if (dialogs.size !== 1) {
    throw new Error('skill_example_viewer_ambiguous')
  }
  const actions = dialogs.values().next().value
  if (!actions) {
    throw new Error('skill_example_viewer_unavailable')
  }
  if (operation === 'copy') {
    if (!(await actions.copy())) {
      throw new Error('skill_example_copy_failed')
    }
    return { skillCommand, exampleId, operation, copied: true }
  }
  return { skillCommand, exampleId, operation, ...(await actions.change(operation === 'open')) }
}
