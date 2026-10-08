export function marketplaceViewerArguments(
  action: string,
  value?: string,
  target?: { source: string; plugin: string; review?: string[] }
): string[] {
  return [
    'plugins',
    'marketplace',
    'viewer',
    '--viewer',
    'host',
    '--action',
    action,
    ...(value === undefined ? [] : ['--value', value]),
    ...(target
      ? ['--source', target.source, '--plugin', target.plugin, ...(target.review ?? [])]
      : [])
  ]
}
