import type { HandlerGroup } from './handler-group-manifest'

export const VIEWER_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'crash-report-viewer',
    keys: ['ui crash-report open'],
    load: async () => (await import('./handlers/crash-report-viewer.js')).CRASH_REPORT_HANDLERS
  },
  {
    name: 'setup-guide-viewer',
    keys: [
      'ui setup-guide open',
      'ui setup-guide select-step',
      'ui setup-guide hide-sidebar',
      'ui setup-guide hide-sidebar-entry'
    ],
    load: async () => (await import('./handlers/setup-guide-viewer.js')).SETUP_GUIDE_HANDLERS
  },
  {
    name: 'feature-tour-viewer',
    keys: ['ui feature-tour open'],
    load: async () => (await import('./handlers/feature-tour-viewer.js')).FEATURE_TOUR_HANDLERS
  },
  {
    name: 'activity-viewer',
    keys: [
      'ui activity get',
      'ui activity copy',
      'ui activity preview-copy-issue-link',
      'ui activity preview-copy-path',
      'ui activity preview',
      'ui activity preview-edit',
      'ui activity context-menu',
      'ui activity preview-review-menu',
      'ui activity preview-issue-menu',
      'ui activity close',
      'ui activity resize',
      'ui activity scroll',
      'ui activity jump',
      'ui activity select',
      'ui activity group-toggle',
      'ui activity mark-all-read',
      'ui activity clear-completed',
      'ui activity clear-thread',
      'ui activity clear-threads',
      'ui activity read-toggle',
      'ui activity read-toggle-many',
      'ui activity origin',
      'ui activity scope-reset',
      'ui activity host-toggle',
      'ui activity hosts-toggle-all',
      'ui activity group',
      'ui activity read',
      'ui activity compact',
      'ui activity children',
      'ui activity search',
      'ui activity search-clear',
      'ui activity search-visible'
    ],
    load: async () => (await import('./handlers/activity-viewer.js')).ACTIVITY_VIEWER_HANDLERS
  },
  {
    name: 'card-viewer',
    keys: ['ui card get', 'ui card mode', 'ui card activity'],
    load: async () => (await import('./handlers/card-viewer.js')).CARD_VIEWER_HANDLERS
  },
  {
    name: 'status-bar-viewer',
    keys: [
      'ui status-bar get',
      'ui status-bar toggle',
      'ui status-bar item',
      'ui status-bar percentage'
    ],
    load: async () => (await import('./handlers/status-bar-viewer.js')).STATUS_BAR_VIEWER_HANDLERS
  },
  {
    name: 'workspace-list-viewer',
    keys: [
      'ui workspace-list get',
      'ui workspace-list group',
      'ui workspace-list sort',
      'ui workspace-list project-order'
    ],
    load: async () =>
      (await import('./handlers/workspace-list-viewer.js')).WORKSPACE_LIST_VIEWER_HANDLERS
  },
  {
    name: 'sidebar-viewer',
    keys: ['ui sidebar get', 'ui sidebar toggle', 'ui panel open'],
    load: async () => (await import('./handlers/sidebar-viewer.js')).SIDEBAR_VIEWER_HANDLERS
  },
  {
    name: 'settings-viewer',
    keys: ['ui settings open', 'ui settings search'],
    load: async () => (await import('./handlers/settings-viewer.js')).SETTINGS_VIEWER_HANDLERS
  },
  {
    name: 'workspace-filter',
    keys: [
      'ui workspace-filter menu',
      'ui project-filter search',
      'ui project-filter highlight',
      'ui project-filter focus',
      'ui project-filter select',
      'ui project-filter remove-last',
      'ui workspace-filter get',
      'ui workspace-filter set',
      'ui workspace-filter reset',
      'ui project-filter remove',
      'ui project-filter toggle'
    ],
    load: async () => (await import('./handlers/workspace-filter.js')).WORKSPACE_FILTER_HANDLERS
  }
]
