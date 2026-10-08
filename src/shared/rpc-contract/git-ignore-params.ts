import { z } from 'zod'
import { KNOWN_HUGE_FOLDER_NAMES } from '../git-huge-folder-ignore'
import { FileMutationOpen } from './files-mutation-params'

export const GitAppendGitignore = FileMutationOpen.omit({ relativePath: true }).extend({
  folderName: z.enum(KNOWN_HUGE_FOLDER_NAMES),
  expectedExecutionHostId: z.string().min(1)
})
