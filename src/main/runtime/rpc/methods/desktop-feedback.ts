import { isAbsolute } from 'node:path'
import { defineMethod } from '../core'
import { DesktopFeedbackSubmitParams } from '../../../../shared/rpc-contract/app-feedback-params'
import {
  MAX_FEEDBACK_IMAGE_BYTES,
  MAX_FEEDBACK_IMAGE_TOTAL_BYTES
} from '../../../../shared/feedback-image-limits'
import { readNodeFileWithinLimit } from '../../../../shared/node-bounded-file-reader'
import type { FeedbackImageAttachment } from '../../../../shared/feedback-submit-contract'
import { assertDesktopAppTarget } from './desktop-app-target'

export const DESKTOP_FEEDBACK_METHODS = [
  defineMethod({
    name: 'desktopFeedback.submit',
    params: DesktopFeedbackSubmitParams,
    handler: async (params, context) => {
      assertDesktopAppTarget(context, params.confirmTarget)
      const images: FeedbackImageAttachment[] = []
      let total = 0
      for (const image of params.images ?? []) {
        if (!isAbsolute(image.path)) {
          throw new Error('Image paths must be absolute on the addressed desktop host')
        }
        const { buffer } = await readNodeFileWithinLimit(
          image.path,
          Math.min(MAX_FEEDBACK_IMAGE_BYTES, MAX_FEEDBACK_IMAGE_TOTAL_BYTES - total),
          { regularFileOnly: true, signal: context.signal }
        )
        total += buffer.length
        images.push({ contentType: image.contentType, data: buffer })
      }
      assertDesktopAppTarget(context, params.confirmTarget)
      return (await import('../../../ipc/feedback')).submitFeedback({
        feedback: params.feedback,
        submitAnonymously: params.submitAnonymously,
        githubLogin: params.submitAnonymously ? null : (params.githubLogin ?? null),
        githubEmail: params.submitAnonymously ? null : (params.githubEmail ?? null),
        ...(params.images === undefined ? {} : { images }),
        submissionType: 'feedback'
      })
    }
  })
]
