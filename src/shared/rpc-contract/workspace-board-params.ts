import { z } from 'zod'
import {
  WORKSPACE_BOARD_COLUMN_WIDTH_MAX,
  WORKSPACE_BOARD_COLUMN_WIDTH_MIN,
  WORKSPACE_STATUS_COLOR_IDS,
  WORKSPACE_STATUS_ICON_IDS
} from '../workspace-statuses'

const viewer = z.literal('host')
const statusId = z.string().min(1)
// Why: matches the board's drag payload cap, the largest selection it moves at once.
const WORKSPACE_BOARD_ASSIGN_MAX_COUNT = 512
// oxlint-disable-next-line no-control-regex -- the point is to match control characters
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/

export const WorkspaceBoardParams = z.discriminatedUnion('operation', [
  z.object({ viewer, operation: z.literal('get') }).strict(),
  z.object({ viewer, operation: z.literal('status-add') }).strict(),
  z
    .object({
      viewer,
      operation: z.literal('status-rename'),
      statusId,
      // Why: a repeated --label reaches the parser NUL-joined, so control characters are refused.
      label: z
        .string()
        .refine((value) => value.trim().length > 0 && !CONTROL_CHARACTERS.test(value))
    })
    .strict(),
  z
    .object({
      viewer,
      operation: z.literal('status-color'),
      statusId,
      color: z.enum(WORKSPACE_STATUS_COLOR_IDS)
    })
    .strict(),
  z
    .object({
      viewer,
      operation: z.literal('status-icon'),
      statusId,
      icon: z.enum(WORKSPACE_STATUS_ICON_IDS)
    })
    .strict(),
  z
    .object({
      viewer,
      operation: z.literal('status-move'),
      statusId,
      direction: z.enum(['left', 'right'])
    })
    .strict(),
  z.object({ viewer, operation: z.literal('status-remove'), statusId }).strict(),
  z
    .object({
      viewer,
      operation: z.literal('assign'),
      workspaceIds: z.array(z.string().min(1)).min(1).max(WORKSPACE_BOARD_ASSIGN_MAX_COUNT),
      // Why: a repeated --status reaches the parser NUL-joined and must not pick one silently.
      statusId: statusId.refine((value) => !CONTROL_CHARACTERS.test(value))
    })
    .strict(),
  z
    .object({
      viewer,
      operation: z.literal('column-width'),
      width: z
        .number()
        .int()
        .min(WORKSPACE_BOARD_COLUMN_WIDTH_MIN)
        .max(WORKSPACE_BOARD_COLUMN_WIDTH_MAX)
    })
    .strict()
])
export type WorkspaceBoardCommand = z.infer<typeof WorkspaceBoardParams>
