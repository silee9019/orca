import { create } from 'zustand'
import type { z } from 'zod'
import { UsageTabSchema } from '../../../shared/rpc-contract/usage-params'

type UsageTab = z.infer<typeof UsageTabSchema>

export const useUsageTabSelection = create<{
  activeUsageTab: UsageTab
  setActiveUsageTab: (tab: UsageTab) => void
}>((set) => ({
  activeUsageTab: 'overview',
  setActiveUsageTab: (tab) => set({ activeUsageTab: UsageTabSchema.parse(tab) })
}))
