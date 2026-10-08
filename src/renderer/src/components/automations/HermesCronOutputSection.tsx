import React, { useState } from 'react'
import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAutomationContentViewer } from '../../runtime/automation-content-viewer'

type CollapsibleSectionProps = {
  ownerKey: string
  content: string
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
  tone?: 'default' | 'muted'
  icon?: LucideIcon
  iconClass?: string
}

export function HermesCronOutputSection({
  ownerKey,
  content,
  title,
  defaultOpen = false,
  children,
  tone = 'default',
  icon: Icon,
  iconClass
}: CollapsibleSectionProps): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  const toggleOpen = (): void => setOpen((value) => !value)
  useAutomationContentViewer({
    kind: 'hermes-output',
    ownerKey,
    content,
    label: title,
    expanded: open,
    canToggle: true,
    onToggle: toggleOpen
  })
  return (
    <section
      className={cn(
        'overflow-hidden rounded-lg border border-border/50',
        tone === 'muted' ? 'bg-muted/15' : 'bg-background'
      )}
    >
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-foreground transition-colors hover:bg-muted/40"
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        {Icon ? <Icon className={cn('size-3.5', iconClass ?? 'text-muted-foreground')} /> : null}
        {title}
      </button>
      {open ? <div className="border-t border-border/50 px-4 py-3">{children}</div> : null}
    </section>
  )
}
