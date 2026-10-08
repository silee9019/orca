import { useEffect } from 'react'
import { TooltipProvider } from '../../src/renderer/src/components/ui/tooltip'
import { useAppStore } from '../../src/renderer/src/store'
import type { Worktree } from '../../src/shared/worktree/types'
import { WorktreeCardDetailsHover } from '../../src/renderer/src/components/sidebar/WorktreeCardMeta'
import { useWorktreeCardDetailsHoverControl } from '../../src/renderer/src/components/sidebar/worktree-card-details-hover-state'
import { useWorktreeCardSecondaryDetails } from '../../src/renderer/src/components/sidebar/use-worktree-card-secondary-details'
import { ActivityThreadHoverCard } from '../../src/renderer/src/components/activity/activity-thread-hover-card'
import type { AgentPaneThread } from '../../src/renderer/src/components/activity/activity-thread-types'
import type { Repo } from '../../src/shared/repo-types'
import { getHostedReviewCacheKey } from '../../src/renderer/src/store/slices/hosted-review-cache-identity'
import { issueCacheKey } from '../../src/renderer/src/store/github/cache-identity'
export const linkedWorkspace: Worktree = {
  id: 'linked-repo::fixture-workspace',
  repoId: 'linked-repo',
  path: '/fixture/workspace',
  head: 'fixture-head',
  branch: 'main',
  isBare: false,
  isMainWorktree: false,
  hostId: 'local',
  displayName: 'linked-fixture',
  comment: '',
  linkedIssue: 41,
  linkedPR: 42,
  linkedLinearIssue: null,
  isArchived: false,
  isUnread: false,
  isPinned: false,
  sortOrder: 0,
  lastActivityAt: 0
}
export const linkedIssue = {
  number: 41,
  title: 'private-issue-title',
  url: 'https://fixture.invalid/private-issue/41'
}
export const linkedReview = {
  provider: 'github',
  number: 42,
  title: 'private-review-title',
  url: 'https://fixture.invalid/private-review/42',
  state: 'open',
  status: 'success',
  updatedAt: '',
  mergeable: 'MERGEABLE'
} as const
export function LinkedBrowserOwnerFixture({
  surface = 'card-details'
}: {
  surface?: 'card-identity' | 'card-details' | 'card-title'
}) {
  const state = useAppStore.getState()
  const control = useWorktreeCardDetailsHoverControl()
  const secondary = useWorktreeCardSecondaryDetails({
    worktree: linkedWorkspace,
    repo: undefined,
    statusPrDisplay: null,
    showStatus: false,
    showIssue: true,
    showLinearIssue: false,
    showJiraIssue: false,
    showPR: true,
    showAutomation: false,
    showCli: false,
    showComment: false,
    showPorts: false,
    issueDisplay: linkedIssue,
    linearIssue: null,
    linearIssueDisplay: null,
    jiraIssueDisplay: null,
    prDisplay: linkedReview,
    linkedGitLabMR: null,
    linkedBitbucketPR: null,
    linkedAzureDevOpsPR: null,
    linkedGiteaPR: null,
    cardProps: [],
    newCardStyle: true,
    compactCards: true,
    agentActivityDisplayMode: 'compact',
    workspacePorts: [],
    openTaskPage: state.openTaskPage,
    updateWorktreeMeta: state.updateWorktreeMeta,
    settings: state.settings
  })
  const openHover = control.handleHoverOpenChange
  useEffect(() => {
    openHover(true)
  }, [openHover])
  return (
    <TooltipProvider>
      <output data-linked-hover>{String(control.hoverOpen)}</output>
      <button data-open-linked-hover onClick={() => control.handleHoverOpenChange(true)}>
        Open fixture hover
      </button>
      <WorktreeCardDetailsHover
        linkedBrowserWorkspaceId={linkedWorkspace.id}
        linkedBrowserSurface={surface}
        issue={linkedIssue}
        linearIssue={null}
        review={linkedReview}
        comment={null}
        onOpenIssueInBrowser={secondary.handleOpenIssueInBrowser}
        onOpenReviewInBrowser={secondary.handleOpenReviewInBrowser}
        hoverControl={control}
      >
        <span>Linked fixture owner</span>
      </WorktreeCardDetailsHover>
    </TooltipProvider>
  )
}

const linkedRepo: Repo = {
  id: linkedWorkspace.repoId,
  path: '/fixture/repo',
  displayName: 'Fixture repo',
  badgeColor: 'muted',
  addedAt: 0
}
export function seedLinkedActivityCache(): void {
  const settings = useAppStore.getState().settings
  const reviewKey = getHostedReviewCacheKey(
    linkedRepo.path,
    linkedWorkspace.branch,
    settings,
    linkedRepo.id,
    linkedRepo.connectionId,
    linkedRepo.executionHostId,
    true
  )
  const issueKey = issueCacheKey(
    linkedRepo.path,
    linkedRepo.id,
    41,
    settings,
    linkedRepo.connectionId,
    linkedRepo.executionHostId,
    true
  )
  useAppStore.setState({
    hostedReviewCache: { [reviewKey]: { data: linkedReview, fetchedAt: Date.now() } },
    issueCache: {
      [issueKey]: { data: { ...linkedIssue, state: 'open', labels: [] }, fetchedAt: Date.now() }
    }
  })
}
export function LinkedActivityOwnerFixture({
  worktree = linkedWorkspace
}: {
  worktree?: Worktree
}) {
  const thread: AgentPaneThread = {
    paneKey: 'linked-tab:linked-leaf',
    tab: {
      id: 'linked-tab',
      ptyId: 'fixture-pty',
      worktreeId: linkedWorkspace.id,
      title: 'Fixture',
      customTitle: null,
      color: null,
      sortOrder: 0,
      createdAt: 0
    },
    worktree,
    repo: linkedRepo,
    agentType: 'codex',
    latestEvent: null,
    currentAgentState: 'working',
    currentAgentEntry: null,
    events: [],
    unread: false,
    paneTitle: 'Fixture',
    responsePreview: '',
    latestTimestamp: 0
  }
  return (
    <TooltipProvider>
      <ActivityThreadHoverCard thread={thread}>
        <span>Activity fixture owner</span>
      </ActivityThreadHoverCard>
    </TooltipProvider>
  )
}
