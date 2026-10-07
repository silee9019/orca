import { z } from 'zod'
import { requiredString } from './rpc-param-primitives'

export const BrowserProfileImportFile = z.object({
  profileId: requiredString('Missing required --profile'),
  filePath: requiredString('Missing required --file')
})
