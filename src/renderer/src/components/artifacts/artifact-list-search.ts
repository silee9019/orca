import type { ArtifactListItem } from '../../../../shared/artifacts'
import {
  artifactSearchHaystack as searchHaystack,
  artifactMatchesSearchQuery as matchesQuery,
  filterArtifactsBySearchQuery as filterByQuery
} from '../../../../shared/artifact-list-search'
import { artifactTypeLabel } from './artifact-display-labels'

export {
  ARTIFACT_LIST_SEARCH_QUERY_MAX_BYTES,
  activeArtifactListSearchQuery,
  clampArtifactListSearchQuery
} from '../../../../shared/artifact-list-search'

export function artifactSearchHaystack(item: ArtifactListItem): string {
  return searchHaystack(item, artifactTypeLabel)
}

export function artifactMatchesSearchQuery(item: ArtifactListItem, query: string): boolean {
  return matchesQuery(item, query, artifactTypeLabel)
}

export function filterArtifactsBySearchQuery(
  artifacts: readonly ArtifactListItem[],
  query: string
): readonly ArtifactListItem[] {
  return filterByQuery(artifacts, query, artifactTypeLabel)
}
