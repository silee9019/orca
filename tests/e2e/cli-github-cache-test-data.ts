import type { PersistedState } from '../../src/shared/persisted-state-types'

export function workspaceGitHubCacheFixture(): PersistedState['githubCache'] {
  return {
    pr: {
      'ssh:fixture:branch': {
        fetchedAt: 123,
        data: {
          number: 7,
          title: 'private cache write PR canary',
          state: 'open',
          url: 'https://github.example/fixture/repo/pull/7',
          checksStatus: 'pending',
          updatedAt: '2026-10-08T00:00:00Z',
          mergeable: 'UNKNOWN',
          reviewDecision: null,
          autoMergeEnabled: false,
          autoMergeAllowed: null,
          mergeQueueRequired: true,
          mergeMethodSettings: {
            defaultMethod: 'squash',
            allowedMethods: { merge: false, squash: true, rebase: false }
          },
          mergeStateStatus: null,
          headSha: 'a'.repeat(40),
          confirmedContainedHeadOid: 'b'.repeat(40),
          headDivergedFromMergedPRAtOid: 'c'.repeat(40),
          baseRefName: 'main',
          headRefName: 'feature',
          prRepo: { owner: 'fixture', repo: 'repo', host: 'github.example' },
          headRepo: { owner: 'fixture-fork', repo: 'repo', host: 'github.example' },
          conflictSummary: {
            baseRef: 'main',
            baseCommit: 'd'.repeat(40),
            commitsBehind: 2,
            files: ['private-file.ts'],
            localMergeState: 'clean'
          },
          stack: {
            number: 8,
            position: 1,
            size: 1,
            baseRefName: 'main',
            baseSha: 'e'.repeat(40),
            entries: [
              {
                position: 1,
                number: 7,
                title: 'private stack canary',
                url: 'https://github.example/fixture/repo/pull/7',
                state: 'draft',
                checksStatus: 'neutral',
                mergeable: 'MERGEABLE',
                reviewDecision: 'REVIEW_REQUIRED',
                mergeStateStatus: null,
                updatedAt: '2026-10-08T00:00:00Z',
                headRefName: 'feature',
                headSha: 'a'.repeat(40)
              }
            ]
          }
        }
      },
      'fixture:null-pr': { fetchedAt: 124, data: null }
    },
    issue: {
      'folder:fixture:9': {
        fetchedAt: 125,
        data: {
          number: 9,
          title: 'private cached issue',
          state: 'closed',
          url: 'https://github.example/fixture/repo/issues/9',
          labels: ['fixture'],
          description: 'private cache write body canary'
        }
      },
      'fixture:null-issue': { fetchedAt: 126, data: null }
    }
  }
}
