import { z } from 'zod'
import { appStarSourceSchema } from '../gh-star-source'

export const GitHubAccountDiagnostic = z.object({ host: z.string().trim().min(1).optional() })
export const GitHubStarRequest = z.object({ source: appStarSourceSchema })
