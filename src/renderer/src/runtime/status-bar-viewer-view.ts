import type { StatusBarViewerSnapshot } from '../../../shared/status-bar-viewer-command'

export function isStatusBarViewerMounted(): boolean {
  return document.querySelector('[data-status-bar-viewer]') !== null
}

export function readStatusBarViewerView(): StatusBarViewerSnapshot | null {
  const node = document.querySelector<HTMLElement>('[data-status-bar-viewer]')
  if (!node) {
    return null
  }
  const bounds = node.getBoundingClientRect()
  if (bounds.width <= 0 || bounds.height <= 0) {
    return null
  }
  return {
    items: node.dataset.statusBarItems?.split(',').filter(Boolean) ?? [],
    percentageDisplay: node.dataset.statusBarPercentage ?? '',
    providers: Array.from(node.querySelectorAll<HTMLElement>('[data-usage-chip]'))
      .filter(
        (chip) =>
          chip.getAttribute('aria-hidden') !== 'true' && chip.getBoundingClientRect().width > 0
      )
      .map((chip) => chip.dataset.usageChip ?? ''),
    meters: Array.from(node.querySelectorAll<HTMLElement>('[data-usage-percentage-value]'))
      .filter((meter) => {
        const chip = meter.closest<HTMLElement>('[data-usage-chip]')
        const bounds = meter.getBoundingClientRect()
        return (
          chip !== null &&
          chip.getAttribute('aria-hidden') !== 'true' &&
          chip.dataset.usageCollapsed !== 'true' &&
          bounds.width > 0 &&
          bounds.height > 0
        )
      })
      .map((meter) => ({
        provider: meter.closest<HTMLElement>('[data-usage-chip]')?.dataset.usageChip ?? '',
        display: meter.dataset.usagePercentageDisplay ?? '',
        value: Number(meter.dataset.usagePercentageValue)
      })),
    compact: node.dataset.statusBarCompact === 'true',
    runtimeContextKey: node.dataset.statusBarRuntime ?? ''
  }
}
