import { SparsePresetViewerParams } from '../../../../shared/sparse-preset-viewer-command'
import { requestAccountViewerAction } from '../../account-viewer-request'
import { defineMethod } from '../core'
import { SparsePresetRemoveParams } from '../../../../shared/rpc-contract/sparse-preset-params'

export const SPARSE_PRESET_METHODS = [
  defineMethod({
    name: 'sparsePreset.viewerAction',
    params: SparsePresetViewerParams,
    handler: ({ repoId, surface, action }, { signal }) =>
      requestAccountViewerAction(
        { domain: 'sparse-preset', action: { repoId, surface, action } },
        signal
      )
  }),
  defineMethod({
    name: 'repo.removeSparsePreset',
    params: SparsePresetRemoveParams,
    handler: (params, { runtime }) => runtime.removeSparsePreset(params.repo, params.presetId)
  })
]
