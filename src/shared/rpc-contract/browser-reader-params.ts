import { redactKagiSessionToken } from '../browser-url'
import { z } from 'zod'
import { BrowserObservationDriver } from './browser-observation-params'
export const BrowserDriverSnapshot = z.array(
  z.object({
    browserPageId: z.string().min(1),
    driver: BrowserObservationDriver
  })
)
export const ClientHostedBrowserRowsSnapshot = z.array(
  z.object({
    worktreeId: z.string().min(1),
    rows: z.array(
      z.object({
        browserPageId: z.string().min(1),
        worktreeId: z.string().min(1),
        url: z.string().transform(redactKagiSessionToken),
        title: z.string().transform(redactKagiSessionToken),
        loading: z.boolean(),
        browserHostClientId: z.string().min(1),
        hostDeviceName: z.string().nullable(),
        hostAbsent: z.boolean()
      })
    )
  })
)
