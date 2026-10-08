import { z } from 'zod'
import { MAX_REPO_ICON_DATA_URL_LENGTH } from '../repo-icon'
export const RepoIconPickerStart = z
  .object({ expectedExecutionHostId: z.literal('local') })
  .strict()
export const RepoIconPickerRequest = RepoIconPickerStart.extend({
  requestId: z.string().uuid()
}).strict()
export const RepoIconPickedImageResult = z
  .object({ dataUrl: z.string().max(MAX_REPO_ICON_DATA_URL_LENGTH), fileName: z.string().min(1) })
  .strict()
