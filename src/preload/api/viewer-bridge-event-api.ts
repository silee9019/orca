import type { activityViewerBridgeApi } from './activity-viewer-bridge'
import type { settingsViewerBridgeApi } from './settings-viewer-bridge'
import type { crashReportBridgeApi } from './crash-report-bridge'
import type { setupGuideBridgeApi } from './setup-guide-bridge'
import type { featureTourBridgeApi } from './feature-tour-bridge'
import type { workspaceBoardViewerBridgeApi } from './workspace-board-viewer-bridge'

export type ViewerBridgeEventApi = Partial<
  typeof activityViewerBridgeApi &
    typeof settingsViewerBridgeApi &
    typeof crashReportBridgeApi &
    typeof setupGuideBridgeApi &
    typeof featureTourBridgeApi &
    typeof workspaceBoardViewerBridgeApi
>
