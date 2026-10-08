export type RepoIconPickedImage = { dataUrl: string; fileName: string }
export type RepoIconPickerState =
  | 'pending'
  | 'cancel_requested'
  | 'completed'
  | 'cancelled'
  | 'failed'
export type RepoIconPickerStatus = {
  requestId: string
  state: RepoIconPickerState
  humanAction: 'select-or-cancel-on-desktop' | 'close-native-picker' | null
  bytes?: number
}
