import { useContext, useState } from 'react'
import {
  ActivityThreadCollapseContext,
  type ActivityThreadCollapseState
} from './activity-thread-collapse-context'

export function useActivityThreadGroupCollapse({
  collapsedGroupKeys,
  onToggleGroupCollapse
}: Partial<ActivityThreadCollapseState>): ActivityThreadCollapseState {
  const [localKeys, setLocalKeys] = useState<Set<string>>(new Set())
  const context = useContext(ActivityThreadCollapseContext)
  if (collapsedGroupKeys !== undefined && onToggleGroupCollapse !== undefined) {
    return { collapsedGroupKeys, onToggleGroupCollapse }
  }
  return (
    context ?? {
      collapsedGroupKeys: localKeys,
      onToggleGroupCollapse: (key) =>
        setLocalKeys((previous) => {
          const next = new Set(previous)
          if (next.has(key)) {
            next.delete(key)
          } else {
            next.add(key)
          }
          return next
        })
    }
  )
}
