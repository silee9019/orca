// Why this file exists: a bare "expo-notifications" plugin entry writes
// `aps-environment: development` into the iOS entitlements, while push-token.ts
// reports `production` for every non-__DEV__ build. A TestFlight or App Store build
// would then register a production APNs token against a sandbox entitlement, and the
// gateway's pushes would be accepted by Apple and delivered nowhere. Deriving the
// mode from an env var the release workflow sets makes the two agree by construction
// instead of relying on the export step to rewrite the entitlement.
//
// app.json stays the source for everything else: Expo reads it first and hands it to
// this function, so the fastlane version/buildNumber rewrite still flows through.
const APS_ENVIRONMENT =
  process.env.ORCA_IOS_APS_ENVIRONMENT === 'production' ? 'production' : 'development'

// Android Dev build: a separate package, name and link scheme so it installs next to the store app
// without touching its data. google-services.json only lists the store package, so the Dev build
// drops it and has no FCM push.
const ANDROID_DEV_BUILD = process.env.ORCA_ANDROID_DEV_BUILD === '1'

function androidConfig(android) {
  if (!ANDROID_DEV_BUILD) {
    return android
  }
  const { googleServicesFile: _storeOnly, ...rest } = android ?? {}
  return { ...rest, package: `${android.package}.dev` }
}

module.exports = ({ config }) => ({
  ...config,
  ...(ANDROID_DEV_BUILD ? { name: 'Orca Dev', scheme: 'orca-dev' } : {}),
  android: androidConfig(config.android),
  ios: {
    ...config.ios,
    entitlements: { ...config.ios?.entitlements, 'aps-environment': APS_ENVIRONMENT }
  },
  plugins: (config.plugins ?? []).map((plugin) =>
    plugin === 'expo-notifications'
      ? [
          'expo-notifications',
          {
            enableBackgroundRemoteNotifications: true,
            mode: APS_ENVIRONMENT,
            icon: './assets/notification-icon.png'
          }
        ]
      : plugin
  )
})
