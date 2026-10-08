import { z } from 'zod'
import { MAX_REPO_PICKER_PATHS, MAX_REPO_PICKER_PATH_LENGTH } from '../repo-picker-types'
import { RepoIconPickerRequest, RepoIconPickerStart } from './workspace-repo-icon-picker-params'
export const RepoFolderPickerKind = z.enum(['folder', 'folders', 'directory'])
export const RepoFolderPickerStart = RepoIconPickerStart.extend({
  kind: RepoFolderPickerKind
}).strict()
export const RepoFolderPickerRequest = RepoIconPickerRequest
export const RepoFolderPickerResult = z
  .object({
    kind: RepoFolderPickerKind,
    paths: z
      .array(
        z
          .string()
          .min(1)
          .refine(
            (value) => new TextEncoder().encode(value).byteLength <= MAX_REPO_PICKER_PATH_LENGTH
          )
      )
      .max(MAX_REPO_PICKER_PATHS)
  })
  .strict()
