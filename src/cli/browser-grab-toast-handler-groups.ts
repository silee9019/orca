import type { HandlerGroup } from './handler-group-manifest'
export const BROWSER_GRAB_TOAST_HANDLER_GROUPS: readonly HandlerGroup[] = [
  {
    name: 'browser-grab-toast',
    keys: ['browser grab-toast status', 'browser grab-toast copy'],
    load: async () => (await import('./handlers/browser-grab-toast.js')).BROWSER_GRAB_TOAST_HANDLERS
  }
]
