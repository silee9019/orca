import type { RepoIconPickedImage, RepoIconPickerStatus } from './repo-icon-picker-types'
export type RepoFolderPickerKind = 'folder' | 'folders' | 'directory'
export type RepoPickerKind = 'icon' | RepoFolderPickerKind
export type RepoFolderSelection = { kind: RepoFolderPickerKind; paths: string[] }
export type RepoPickerSelection = { kind: 'icon'; image: RepoIconPickedImage } | RepoFolderSelection
export type RepoPickerStatus = RepoIconPickerStatus & {
  selectionKind?: RepoFolderPickerKind
  selectedPathCount?: number
}
export const MAX_REPO_PICKER_PATHS = 500
export const MAX_REPO_PICKER_PATH_LENGTH = 8192
