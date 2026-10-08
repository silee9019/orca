import { expect, it } from 'vitest'
import { WorkspaceFilterResultSchema, defaultWorkspaceFilters } from './workspace-filter-command'
import { SettingsViewerResultSchema } from './settings-viewer-command'
import { SidebarViewerResultSchema } from './sidebar-viewer-command'
import { CardViewerResultSchema } from './card-viewer-command'

it('reads newer viewer replies without accepting malformed required fields', () => {
  const filter = {
    viewer: 'host',
    viewerId: 1,
    filters: { ...defaultWorkspaceFilters(), futureFilter: true },
    persisted: true,
    applied: false,
    visibleWorktreeIds: [],
    visibleFolderWorkspaceIds: [],
    futureReply: true,
    reason: 'future_reason',
    control: {
      open: false,
      query: '',
      highlightedRepoId: '',
      resultRepoIds: [],
      inputFocused: false,
      futureControl: true
    }
  }
  const settings = {
    viewer: 'host',
    viewerId: 1,
    applied: false,
    activeSectionId: null,
    resolvedSectionId: null,
    queryInput: '',
    queryApplied: '',
    visibleSectionIds: [],
    renderedSectionIds: [],
    sectionTargetPresent: false,
    futureReply: true,
    reason: 'future_reason'
  }
  const sidebar = {
    viewer: 'host',
    viewerId: 1,
    dispatched: true,
    applied: false,
    persisted: null,
    sidebarOpen: true,
    rightSidebarOpen: true,
    rightSidebarTab: 'future-panel',
    explorerView: 'future-view',
    futureReply: true,
    reason: 'future_reason',
    rendered: {
      leftMounted: true,
      leftVisible: true,
      rightMounted: true,
      rightVisible: true,
      panel: 'future-panel',
      explorerView: 'future-view',
      panelReady: true,
      availablePanels: [],
      futureSnapshot: true
    }
  }
  const card = {
    viewer: 'host',
    viewerId: 1,
    dispatched: true,
    applied: false,
    persisted: null,
    compact: false,
    defaulted: true,
    properties: ['future-property'],
    activityMode: 'future-mode',
    rendered: [
      {
        id: 'workspace',
        repoId: 'project',
        hostId: null,
        compact: false,
        newStyle: true,
        properties: [],
        activityMode: 'future-mode',
        runtimeContextKey: 'local',
        futureSnapshot: true
      }
    ],
    futureReply: true,
    reason: 'future_reason'
  }
  expect(CardViewerResultSchema.parse(card)).toMatchObject({
    reason: 'viewer_not_applied',
    activityMode: 'future-mode'
  })
  expect(WorkspaceFilterResultSchema.parse(filter)).toMatchObject({ reason: 'viewer_not_applied' })
  expect(SettingsViewerResultSchema.parse(settings)).toMatchObject({ reason: 'viewer_not_applied' })
  expect(SidebarViewerResultSchema.parse(sidebar)).toMatchObject({
    reason: 'viewer_not_applied',
    explorerView: 'future-view'
  })
  for (const [schema, value] of [
    [WorkspaceFilterResultSchema, filter],
    [SettingsViewerResultSchema, settings],
    [SidebarViewerResultSchema, sidebar],
    [CardViewerResultSchema, card]
  ] as const) {
    expect(schema.safeParse({ ...value, applied: 'true' }).success).toBe(false)
    expect(schema.safeParse({ ...value, reason: 1 }).success).toBe(false)
    expect(schema.parse(value)).not.toHaveProperty('futureReply')
  }
})
