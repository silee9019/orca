import { useMobileDriverViewer } from '@/runtime/mobile-driver-viewer'
import { getDriverForPty, getAllDrivers } from '@/lib/pane-manager/mobile-driver-state'
import {
  getFitOverrideForPty,
  getMobileFitOverridePtyIds
} from '@/lib/pane-manager/mobile-fit-overrides'
import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from 'react'
import { Minimize2, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { DriverState } from '@/lib/pane-manager/mobile-driver-state'
import { shouldFocusMobileDriverAction } from './mobile-driver-overlay-focus'
import {
  createMobileDriverOverlayCollapseState,
  getMobileDriverOverlayCollapseState
} from './mobile-driver-overlay-collapse'
import { translate } from '@/i18n/i18n'

type Props = {
  ptyId?: string
  driver: DriverState
  hasFitOverride: boolean
  onAction: () => void | boolean | Promise<void | boolean>
  onAllAction?: () => void | boolean | Promise<void | boolean>
  /** Identifier class on the rendered root, used by e2e selectors. */
  rootClassName?: string
}

// Why: see docs/mobile-presence-lock.md. Driving state preserves output streaming
// so the chip mode lets users keep watching; held-fit state has no live output to
// preserve, so it stays loud until Restore.
export function MobileDriverOverlay({
  ptyId,
  driver,
  hasFitOverride,
  onAction,
  onAllAction,
  rootClassName
}: Props): ReactElement | null {
  const isMobileDriving = driver.kind === 'mobile'
  const isHeldAtPhoneFit = !isMobileDriving && hasFitOverride
  const driverClientId = driver.kind === 'mobile' ? driver.clientId : null

  const [collapseState, setCollapseState] = useState(() =>
    createMobileDriverOverlayCollapseState(driverClientId)
  )
  const busyRef = useRef(false)
  const [actionPending, setActionPending] = useState(false)
  const [allActionPending, setAllActionPending] = useState(false)
  const mountedRef = useRef(false)

  const setOverlayRootRef = useCallback((node: HTMLDivElement | null): void => {
    mountedRef.current = node !== null
    if (node) {
      // Why: take-back/restore can resolve after the overlay renders null; a
      // later mobile session must not inherit stale disabled state.
      setActionPending(false)
      setAllActionPending(false)
    }
  }, [])

  const currentCollapseState = getMobileDriverOverlayCollapseState(collapseState, driverClientId)
  // Why: a new mobile actor must be loud even if the prior driver was collapsed.
  if (currentCollapseState !== collapseState) {
    setCollapseState(currentCollapseState)
  }
  const collapsed = currentCollapseState.collapsed

  const actorCurrent = (): boolean => {
    if (!ptyId) {
      return true
    }
    const current = getDriverForPty(ptyId)
    return (
      current.kind === driver.kind &&
      (current.kind !== 'mobile' ||
        (driver.kind === 'mobile' && current.clientId === driver.clientId)) &&
      (current.kind === 'mobile' || getFitOverrideForPty(ptyId)?.mode === 'mobile-fit')
    )
  }
  const setCollapsed = (value: boolean): boolean => {
    if (!mountedRef.current || !actorCurrent() || !isMobileDriving) {
      return false
    }
    setCollapseState({ driverClientId, collapsed: value })
    return true
  }
  useMobileDriverViewer({
    ptyId,
    visible: isMobileDriving || isHeldAtPhoneFit,
    current: () => mountedRef.current && actorCurrent(),
    read: () => {
      const owned = new Set(getMobileFitOverridePtyIds())
      for (const [id, value] of getAllDrivers()) {
        if (value.kind === 'mobile') {
          owned.add(id)
        }
      }
      const current = ptyId ? getDriverForPty(ptyId) : driver
      return {
        driving: current.kind === 'mobile',
        heldFit: Boolean(ptyId && getFitOverrideForPty(ptyId)?.mode === 'mobile-fit'),
        collapsed,
        pending: busyRef.current,
        remainingCount: owned.size
      }
    },
    collapse: setCollapsed,
    restore: (all) => (all ? handleAllAction() : handleAction())
  })

  if (!isMobileDriving && !isHeldAtPhoneFit) {
    return null
  }

  const handleAction = async (): Promise<boolean> => {
    if (busyRef.current || !actorCurrent()) {
      return false
    }
    busyRef.current = true
    setActionPending(true)
    try {
      return (await onAction()) === true
    } catch {
      return false
    } finally {
      busyRef.current = false
      if (mountedRef.current) {
        setActionPending(false)
      }
    }
  }

  const handleAllAction = async (): Promise<boolean> => {
    if (!onAllAction || busyRef.current || !actorCurrent()) {
      return false
    }
    busyRef.current = true
    setAllActionPending(true)
    try {
      return (await onAllAction()) === true
    } catch {
      return false
    } finally {
      busyRef.current = false
      if (mountedRef.current) {
        setAllActionPending(false)
      }
    }
  }

  if (isHeldAtPhoneFit) {
    return (
      <LoudOverlay
        title={translate(
          'auto.components.terminal.pane.MobileDriverOverlay.4b7e1c9a20',
          'Still sized for your phone'
        )}
        body={translate(
          'auto.components.terminal.pane.MobileDriverOverlay.9d2f6a3e58',
          'Your phone session ended. Restore to fit this window.'
        )}
        actionLabel={translate(
          'auto.components.terminal.pane.MobileDriverOverlay.1e5c8b7d43',
          'Restore'
        )}
        actionPending={actionPending}
        allActionLabel={translate(
          'auto.components.terminal.pane.MobileDriverOverlay.6a3d9f2c71',
          'Restore all'
        )}
        allActionPending={allActionPending}
        onAction={handleAction}
        onAllAction={onAllAction ? handleAllAction : undefined}
        tone="held"
        rootRef={setOverlayRootRef}
        rootClassName={rootClassName}
      />
    )
  }

  if (collapsed) {
    return (
      <LockChip
        actionPending={actionPending}
        onAction={handleAction}
        onExpand={() => setCollapsed(false)}
        rootRef={setOverlayRootRef}
        rootClassName={rootClassName}
      />
    )
  }

  return (
    <LoudOverlay
      title={translate(
        'auto.components.terminal.pane.MobileDriverOverlay.c7e4a2b8f1',
        'Your phone is in control'
      )}
      body={translate(
        'auto.components.terminal.pane.MobileDriverOverlay.8c1a5e9f36',
        'Desktop typing is paused. Output keeps streaming.'
      )}
      actionLabel={translate(
        'auto.components.terminal.pane.MobileDriverOverlay.c6460cf584',
        'Take back'
      )}
      actionPending={actionPending}
      allActionLabel={translate(
        'auto.components.terminal.pane.MobileDriverOverlay.2f7b4d1e95',
        'Take back all'
      )}
      allActionPending={allActionPending}
      onAction={handleAction}
      onAllAction={onAllAction ? handleAllAction : undefined}
      onCollapse={() => setCollapsed(true)}
      tone="driving"
      rootRef={setOverlayRootRef}
      rootClassName={rootClassName}
    />
  )
}

type LoudOverlayProps = {
  title: string
  body: string
  actionLabel: string
  actionPending: boolean
  allActionLabel?: string
  allActionPending?: boolean
  onAction: () => void | boolean | Promise<void | boolean>
  onAllAction?: () => void | boolean | Promise<void | boolean>
  onCollapse?: () => void
  tone: 'driving' | 'held'
  rootRef?: (node: HTMLDivElement | null) => void
  rootClassName?: string
}

function LoudOverlay({
  title,
  body,
  actionLabel,
  actionPending,
  allActionLabel,
  allActionPending = false,
  onAction,
  onAllAction,
  onCollapse,
  tone,
  rootRef: outerRootRef,
  rootClassName
}: LoudOverlayProps): ReactElement {
  const titleId = useId()
  const collapseLabel = translate(
    'auto.components.terminal.pane.MobileDriverOverlay.3a9c5f7e12',
    'Minimize'
  )
  const bodyId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const actionRef = useRef<HTMLButtonElement>(null)
  const setRootRef = useCallback(
    (node: HTMLDivElement | null): void => {
      rootRef.current = node
      outerRootRef?.(node)
    },
    [outerRootRef]
  )
  // Why: focus the recovery action on mount only when the user isn't already
  // typing into another input (composer, command palette, settings field).
  // Unconditional autoFocus yanks focus on every overlay mount, so a phone
  // taking the floor while the desktop user is typing elsewhere would route
  // the next Space/Enter into Take back / Restore. See PR #1899 follow-up.
  useEffect(() => {
    const paneScope = rootRef.current?.parentElement
    if (shouldFocusMobileDriverAction(document.activeElement, document.body, paneScope)) {
      actionRef.current?.focus()
    }
  }, [])
  // Why: terminal output is still useful status while mobile owns input, so the
  // lock UI must not add a pane-wide scrim or blur over the live stream.
  return (
    <div
      ref={setRootRef}
      role="dialog"
      aria-live="assertive"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className={cn(
        'pointer-events-none absolute inset-0 z-50 flex items-center justify-center p-6',
        rootClassName
      )}
    >
      <div className="pointer-events-auto relative flex w-full max-w-sm gap-3 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-floating">
        <div className="relative mt-0.5 shrink-0">
          <Smartphone className="size-4 text-muted-foreground" aria-hidden="true" />
          {tone === 'driving' ? (
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -top-0.5 size-1.5 animate-pulse rounded-full bg-foreground ring-2 ring-card"
            />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div id={titleId} className="pr-6 text-sm font-semibold leading-5">
            {title}
          </div>
          <div id={bodyId} className="mt-0.5 text-sm text-muted-foreground">
            {body}
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-1.5">
            {onAllAction && allActionLabel ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onAllAction}
                disabled={actionPending || allActionPending}
              >
                {allActionLabel}
              </Button>
            ) : null}
            {/* Focus is moved to this button only when no user input is active; see effect above. */}
            <Button
              ref={actionRef}
              type="button"
              variant="default"
              size="sm"
              onClick={onAction}
              disabled={actionPending || allActionPending}
            >
              {actionLabel}
            </Button>
          </div>
        </div>
        {onCollapse && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                className="absolute right-2 top-2"
                aria-label={collapseLabel}
                onClick={onCollapse}
              >
                <Minimize2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              {collapseLabel}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

type ChipProps = {
  actionPending: boolean
  onAction: () => void | boolean | Promise<void | boolean>
  onExpand: () => void
  rootRef?: (node: HTMLDivElement | null) => void
  rootClassName?: string
}

function LockChip({
  actionPending,
  onAction,
  onExpand,
  rootRef,
  rootClassName
}: ChipProps): ReactElement {
  return (
    <div
      ref={rootRef}
      className={cn(
        'absolute right-2 top-2 z-50 flex items-center gap-1.5 rounded-full border border-border bg-card px-2 py-1 text-xs font-medium text-card-foreground shadow-xs',
        rootClassName
      )}
    >
      <Smartphone className="size-3 text-foreground" aria-hidden="true" />
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="px-1 font-medium"
        onClick={onExpand}
      >
        {translate('auto.components.terminal.pane.MobileDriverOverlay.c44659e09f', 'Phone driving')}
      </Button>
      <Button type="button" variant="default" size="xs" onClick={onAction} disabled={actionPending}>
        {translate('auto.components.terminal.pane.MobileDriverOverlay.c6460cf584', 'Take back')}
      </Button>
    </div>
  )
}
