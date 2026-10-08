import { TimeDigitInput, type AutomationTimeDigitHandle } from './AutomationTimeDigitInput'
import {
  getAutomationClockParts,
  formatAutomationTimeFromClockParts,
  type AutomationClockParts
} from './automation-time-digits'
import { useAutomationTimeViewerController } from '../../runtime/automation-time-viewer-controller'
export {
  parseAutomationTime,
  formatAutomationTimeInput,
  resolveDigitCommit,
  resolveDigitStep,
  clampInt,
  type AutomationClockParts
} from './automation-time-digits'
import React from 'react'
import { Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'

const TIME_SHELL_CLASS =
  'flex h-9 w-full items-center gap-2 rounded-md border border-input bg-input/30 px-3 shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30'

export function AutomationTimeField({
  time,
  mode = 'time',
  onTimeChange,
  className
}: {
  time: string
  mode?: 'time' | 'minute'
  onTimeChange: (time: string) => void
  className?: string
}): React.JSX.Element {
  const hourRef = React.useRef<AutomationTimeDigitHandle>(null)
  const minuteRef = React.useRef<AutomationTimeDigitHandle>(null)
  const clock = getAutomationClockParts(time)
  // Why: digit commits close over the latest clock parts without stale hour/minute.
  // Sync in an effect so render stays pure (React Doctor: no ref writes during render).
  const clockRef = React.useRef(clock)
  React.useEffect(() => {
    clockRef.current = getAutomationClockParts(time)
  }, [time])

  const patchTime = (patch: Partial<AutomationClockParts>): string => {
    // Why: apply the patch to the ref immediately so a second digit field commit
    // in the same tick (or before the parent re-renders) cannot clobber the first.
    const next = { ...clockRef.current, ...patch }
    clockRef.current = next
    const value = formatAutomationTimeFromClockParts(next)
    onTimeChange(value)
    return value
  }

  useAutomationTimeViewerController({
    time,
    mode,
    period: clock.period,
    hourRef,
    minuteRef,
    onTogglePeriod: () => patchTime({ period: clock.period === 'AM' ? 'PM' : 'AM' })
  })

  return (
    <div className={cn(TIME_SHELL_CLASS, className)}>
      <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {mode === 'time' ? (
          <>
            <TimeDigitInput
              controlRef={hourRef}
              value={clock.hour12}
              min={1}
              max={12}
              pad={false}
              ariaLabel={translate(
                'auto.components.automations.AutomationTimeField.aa593eb5e2',
                'Hour'
              )}
              onCommit={(hour12) => patchTime({ hour12 })}
            />
            <span className="select-none text-sm text-muted-foreground" aria-hidden>
              :
            </span>
            <TimeDigitInput
              controlRef={minuteRef}
              value={clock.minute}
              min={0}
              max={59}
              ariaLabel={translate(
                'auto.components.automations.AutomationTimeField.32a5e4e35e',
                'Minute'
              )}
              onCommit={(minute) => patchTime({ minute })}
            />
            <button
              type="button"
              // The label overrides the visible text, so name the current period explicitly.
              aria-label={`${translate(
                'auto.components.automations.AutomationTimeField.39ec1383f6',
                'AM or PM'
              )}: ${clock.period}`}
              aria-pressed={clock.period === 'PM'}
              onClick={() => patchTime({ period: clock.period === 'AM' ? 'PM' : 'AM' })}
              className="ml-auto h-7 shrink-0 rounded-sm px-2 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:bg-accent/60 focus-visible:text-foreground"
            >
              {clock.period}
            </button>
          </>
        ) : (
          <>
            <span className="select-none text-sm text-muted-foreground" aria-hidden>
              :
            </span>
            <TimeDigitInput
              controlRef={minuteRef}
              value={clock.minute}
              min={0}
              max={59}
              ariaLabel={translate(
                'auto.components.automations.AutomationTimeField.32a5e4e35e',
                'Minute'
              )}
              onCommit={(minute) => patchTime({ minute })}
            />
          </>
        )}
      </div>
    </div>
  )
}
