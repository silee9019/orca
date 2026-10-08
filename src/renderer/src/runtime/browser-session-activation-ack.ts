import { z } from 'zod'
const Acknowledgment = z.object({
  worktree: z.string().min(1),
  publicationEpoch: z.string().min(1),
  snapshotVersion: z.number().int().nonnegative(),
  activeTabId: z.string().min(1),
  activeTabType: z.literal('browser'),
  tabs: z.array(z.object({ id: z.string(), type: z.string(), isActive: z.boolean() }))
})
export function hasBrowserSessionActivationAcknowledgment(
  value: unknown,
  worktreeId: string,
  hostTabId: string
): boolean {
  const parsed = Acknowledgment.safeParse(value)
  return (
    parsed.success &&
    parsed.data.worktree === worktreeId &&
    parsed.data.activeTabId === hostTabId &&
    parsed.data.tabs.some((tab) => tab.id === hostTabId && tab.type === 'browser' && tab.isActive)
  )
}
