import { ImeInput } from '@/lib/ime-text-field'
import React from 'react'
import { resolveDigitCommit, resolveDigitStep } from './automation-time-digits'
import type { AutomationTimeViewerAction } from '../../../../shared/automation-time-viewer-command'

type DigitAction = Exclude<AutomationTimeViewerAction, { kind: 'get' | 'period' }>
type DigitState = { value: number; text: string; focused: boolean }
type PendingDigit = {
  expected: number | undefined
  resolve: (state: DigitState) => void
  reject: (error: Error) => void
}
export type AutomationTimeDigitHandle = {
  get: () => DigitState
  apply: (action: DigitAction) => Promise<DigitState>
}
function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export function TimeDigitInput({
  value,
  min,
  max,
  pad = true,
  ariaLabel,
  onCommit,
  controlRef
}: {
  value: number
  min: number
  max: number
  pad?: boolean
  ariaLabel: string
  onCommit: (value: number) => void
  controlRef?: React.Ref<AutomationTimeDigitHandle>
}): React.JSX.Element {
  const [text, setText] = React.useState(pad ? pad2(value) : String(value))
  const [focused, setFocused] = React.useState(false)
  const [, setRevision] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const lastCommittedRef = React.useRef(value)
  const pending = React.useRef<PendingDigit | null>(null)
  React.useEffect(() => {
    lastCommittedRef.current = value
    if (!focused) {
      setText(pad ? pad2(value) : String(value))
    }
  }, [focused, pad, value])
  const commit = (raw: string): number => {
    const next = resolveDigitCommit(raw, value, min, max)
    setText(pad ? pad2(next) : String(next))
    if (next !== lastCommittedRef.current) {
      lastCommittedRef.current = next
      onCommit(next)
    }
    return next
  }
  const input = (raw: string): number | undefined => {
    const next = raw.replace(/\D/g, '').slice(0, 2)
    setText(next)
    return next.length === 2 ? commit(next) : undefined
  }
  const step = (delta: 1 | -1): number => {
    const next = resolveDigitStep(text, value, min, max, delta)
    setText(pad ? pad2(next) : String(next))
    if (next !== lastCommittedRef.current) {
      lastCommittedRef.current = next
      onCommit(next)
    }
    return next
  }
  const blur = (): number => {
    setFocused(false)
    return commit(text)
  }
  React.useImperativeHandle(controlRef, () => ({
    get: () => ({ value, text, focused }),
    apply: (action) => {
      if (pending.current) {
        return Promise.reject(new Error('viewer_busy'))
      }
      return new Promise((resolve, reject) => {
        const request: PendingDigit = { resolve, reject, expected: undefined }
        pending.current = request
        try {
          if (action.kind === 'commit') {
            inputRef.current?.blur()
            request.expected = blur()
          } else {
            inputRef.current?.focus()
            request.expected = action.kind === 'input' ? input(action.value) : step(action.delta)
          }
          setRevision((revision) => revision + 1)
        } catch (error) {
          pending.current = null
          reject(error)
        }
      })
    }
  }))
  React.useLayoutEffect(() => {
    const request = pending.current
    if (!request) {
      return
    }
    pending.current = null
    if (request.expected !== undefined && request.expected !== value) {
      request.reject(new Error('viewer_target_changed'))
    } else {
      request.resolve({ value, text, focused })
    }
  })
  React.useEffect(
    () => () => {
      pending.current?.reject(new Error('viewer_unmounted'))
      pending.current = null
    },
    []
  )
  return (
    <ImeInput
      ref={inputRef}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      aria-label={ariaLabel}
      value={text}
      onFocus={(event) => {
        setFocused(true)
        event.currentTarget.select()
      }}
      onBlur={blur}
      onChange={(event) => input(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault()
          step(event.key === 'ArrowUp' ? 1 : -1)
          return
        }
        if (event.key === 'Enter') {
          event.currentTarget.blur()
        }
      }}
      className="h-7 w-9 rounded-sm border-0 bg-transparent p-0 text-center text-sm tabular-nums tracking-wide text-foreground outline-none selection:bg-primary/20 focus-visible:bg-accent/50"
    />
  )
}
