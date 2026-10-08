import { appStarSourceSchema } from '../../shared/gh-star-source'
import { starOrca } from './client'
import { getCohortAtEmit } from '../telemetry/cohort-classifier'
import { track } from '../telemetry/client'

export async function starOrcaFromSource(source: unknown): Promise<boolean> {
  const sourceParse = appStarSourceSchema.safeParse(source)
  const starred = await starOrca()
  if (starred && sourceParse.success) {
    track('app_starred_orca', { source: sourceParse.data, ...getCohortAtEmit() })
  }
  return starred
}
