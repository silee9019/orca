import Constants from 'expo-constants'

/** True in the Android Dev build; `app.config.js` writes the flag into the embedded manifest. */
export const isAndroidDevBuild: boolean = Constants.expoConfig?.extra?.androidDevBuild === true
