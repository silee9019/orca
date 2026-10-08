import type { GroupHeaderRow } from '../grouping/row-types'

export function getSectionHeaderCollapseKey(
  row: Pick<GroupHeaderRow, 'collapseKey' | 'key'>
): string {
  return row.collapseKey ?? row.key
}
