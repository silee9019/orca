import { expect, it } from 'vitest'
import type { WorkspaceBoardSnapshot } from '../../../shared/workspace-board-command'
import {
  assignmentPersisted,
  boardShowsAssignment,
  buildAssignmentReport,
  planWorkspaceAssignment
} from './workspace-board-assignment-plan'
import type { LocalHostWrite } from './workspace-board-local-host-readback'

const view: WorkspaceBoardSnapshot = {
  runtimeContextKey: 'k',
  open: true,
  columnWidth: 308,
  statuses: [
    { id: 'todo', label: 'Todo' },
    { id: 'done', label: 'Done' }
  ],
  workspaces: [
    { id: 'r::/a', repoId: 'r', statusId: 'todo', hostId: 'local' },
    { id: 'r::/b', repoId: 'r', statusId: 'done', hostId: 'local' },
    { id: 's::/c', repoId: 's', statusId: 'todo', hostId: 'ssh:box' }
  ]
}
const host = { viewer: 'host', operation: 'assign', statusId: 'done' } as const

it('plans each distinct workspace once and marks only the ones that change', () => {
  const plan = planWorkspaceAssignment(
    { ...host, workspaceIds: ['r::/a', 'r::/b', 'r::/a', 's::/c'] },
    view
  )
  expect(plan.entries.map((entry) => [entry.workspace.id, entry.changed])).toEqual([
    ['r::/a', true],
    ['r::/b', false],
    ['s::/c', true]
  ])
})
it('refuses in a fixed order, so one bad id rejects the whole request', () => {
  const plan = (workspaceIds: string[], statusId = 'done', snapshot = view) =>
    planWorkspaceAssignment({ ...host, workspaceIds, statusId }, snapshot)
  expect(() => plan(['r::/a'], 'done', { ...view, workspaces: undefined })).toThrow(
    'workspace_board_unavailable'
  )
  expect(() => plan(['folder:1', 'ghost'], 'ghost')).toThrow('workspace_status_unavailable')
  expect(() => plan(['r::/a', 'folder:1', 'ghost'])).toThrow('workspace_folder_unsupported')
  expect(() => plan(['r::/a', 'ghost'])).toThrow('workspace_unavailable')
})
it('shows the assignment only while every changed workspace sits in the target lane', () => {
  const plan = planWorkspaceAssignment({ ...host, workspaceIds: ['r::/a', 's::/c'] }, view)
  expect(boardShowsAssignment(plan, view)).toBe(false)
  expect(boardShowsAssignment(plan, null)).toBe(false)
  const moved = {
    ...view,
    workspaces: view.workspaces?.map((w) => ({ ...w, statusId: 'done' }))
  }
  expect(boardShowsAssignment(plan, moved)).toBe(true)
})

const reportFor = (
  ids: string[],
  writes: [string, LocalHostWrite][]
): ReturnType<typeof buildAssignmentReport> =>
  buildAssignmentReport(
    planWorkspaceAssignment({ ...host, workspaceIds: ids }, view),
    new Map(writes),
    false
  )
it('never reports a remote write as confirmed, even if a read said so', () => {
  const report = reportFor(['s::/c'], [['s::/c', 'confirmed']])
  expect(report.workspaces[0]).toMatchObject({ hostId: 'ssh:box', hostWrite: 'unverifiable' })
})
it('summarizes persistence so a failed write is never hidden by its siblings', () => {
  const cases: [string[], [string, LocalHostWrite][], boolean | null][] = [
    [['r::/a'], [['r::/a', 'confirmed']], true],
    [['r::/a'], [['r::/a', 'not_confirmed']], false],
    [['r::/a'], [['r::/a', 'unverifiable']], null],
    [['r::/a', 's::/c'], [['r::/a', 'confirmed']], null],
    [['r::/a', 's::/c'], [['r::/a', 'not_confirmed']], false],
    [['r::/b'], [], null],
    [['r::/a', 'r::/b'], [['r::/a', 'confirmed']], true]
  ]
  for (const [ids, writes, expected] of cases) {
    expect(assignmentPersisted(reportFor(ids, writes))).toBe(expected)
  }
  // Two local writes: one landed, one did not.
  const two = {
    ...view,
    workspaces: [
      ...(view.workspaces ?? []),
      { id: 'r::/d', repoId: 'r', statusId: 'todo', hostId: 'local' }
    ]
  }
  const mixed = buildAssignmentReport(
    planWorkspaceAssignment({ ...host, workspaceIds: ['r::/a', 'r::/d'] }, two),
    new Map<string, LocalHostWrite>([
      ['r::/a', 'confirmed'],
      ['r::/d', 'not_confirmed']
    ]),
    false
  )
  expect(assignmentPersisted(mixed)).toBe(false)
})
