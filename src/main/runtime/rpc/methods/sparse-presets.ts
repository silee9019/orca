import { defineMethod } from '../core'
import { SparsePresetRemoveParams } from '../../../../shared/rpc-contract/sparse-preset-params'

export const SPARSE_PRESET_METHODS = [
  defineMethod({
    name: 'repo.removeSparsePreset',
    params: SparsePresetRemoveParams,
    handler: (params, { runtime }) => runtime.removeSparsePreset(params.repo, params.presetId)
  })
]
