import { useLayoutEffect, useState, type RefObject } from 'react'
import type { ProjectFilterControl } from '../../../shared/rpc-contract/workspace-filter-params'
import { publishProjectFilterControl } from './project-filter-controls'

export function useProjectFilterControls(options: {
  surface: ProjectFilterControl['surface']
  enabled?: boolean
  open: boolean
  query: string
  highlightedRepoId: string
  resultRepoIds: string[]
  inputRef: RefObject<HTMLInputElement | null>
  setQuery: (query: string) => void
  setHighlightedRepoId: (repoId: string) => void
  onOpenChange?: (open: boolean) => void
}): { onFocus: () => void; onBlur: () => void } {
  const [inputFocused, setInputFocused] = useState(false)
  useLayoutEffect(() => {
    if (options.enabled === false) {
      return
    }
    return publishProjectFilterControl(options.surface, {
      snapshot: {
        open: options.open,
        query: options.query,
        highlightedRepoId: options.highlightedRepoId,
        resultRepoIds: options.resultRepoIds,
        inputFocused
      },
      apply: (command) => {
        if (command.action === 'menu') {
          options.onOpenChange?.(command.open)
          return
        }
        if (!options.inputRef.current) {
          throw new Error('filter_input_unavailable')
        }
        if (command.action === 'search') {
          options.setQuery(command.query)
        } else if (command.action === 'highlight') {
          options.setHighlightedRepoId(command.repoId)
        } else {
          options.inputRef.current.focus()
        }
      }
    })
  })
  return { onFocus: () => setInputFocused(true), onBlur: () => setInputFocused(false) }
}
