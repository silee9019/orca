import { expect, it } from 'vitest'
import { AutomationEditorViewerActionSchema } from '../../shared/automation-editor-viewer-command'

it('accepts reviewed project picker controls and requires a path for addition', () => {
  const reviewedTarget = '00000000-0000-4000-8000-000000000001'
  const childReview = '00000000-0000-4000-8000-000000000002'
  for (const action of [
    { kind: 'get' },
    { kind: 'open', value: true, reviewedTarget: childReview },
    { kind: 'query', value: 'orca', reviewedTarget: childReview },
    { kind: 'command', repoId: 'repo', reviewedTarget: childReview },
    { kind: 'select', repoId: 'repo', reviewedTarget: childReview },
    { kind: 'host-menu', projectKey: 'project', reviewedTarget: childReview },
    {
      kind: 'host-hover',
      projectKey: 'project',
      region: 'row',
      hovered: true,
      reviewedTarget: childReview
    },
    { kind: 'focus', reviewedTarget: childReview },
    { kind: 'add', path: '/folder', reviewedTarget: childReview }
  ]) {
    expect(
      AutomationEditorViewerActionSchema.safeParse({ kind: 'project-form', reviewedTarget, action })
        .success
    ).toBe(true)
  }
  expect(
    AutomationEditorViewerActionSchema.safeParse({
      kind: 'project-form',
      reviewedTarget,
      action: { kind: 'add', reviewedTarget: childReview }
    }).success
  ).toBe(false)
})
