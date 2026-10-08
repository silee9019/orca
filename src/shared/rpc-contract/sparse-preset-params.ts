import { z } from 'zod'
import { RepoSelector } from './github-repo-target-params'

export const SparsePresetRemoveParams = RepoSelector.extend({ presetId: z.string().min(1) })
