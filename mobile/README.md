# NEWBIZZ Mobile (Android APK)

Expo SDK 57 app for water-bottle manufacturing field operations (agent +
manager roles). Talks directly to the Supabase project used by the web app.

## Build a signed release APK

One-time machine setup (see `keystore/README.md`): generate the release
keystore outside the repo and put the real `NEWBIZZ_UPLOAD_*` passwords in
`%USERPROFILE%\.gradle\gradle.properties` (never committed).

```
cd mobile
npm install --legacy-peer-deps
npx expo prebuild -p android --no-install   # only when app.json/plugins changed
cd android
.\gradlew assembleRelease
```

Output: `android\app\build\outputs\apk\release\app-release.apk`

Install on a connected device: `adb install -r app-release.apk`

First build downloads the Gradle distribution + all native dependencies
(allow 10–20 minutes); subsequent builds are incremental.

## Windows long-path note

Deep `node_modules` source paths push some C++ object-file paths past the
Windows 260-char `MAX_PATH` limit, and CMake 3.22.1's bundled ninja is not
long-path aware. The root `android/build.gradle` therefore forces
**CMake 3.30.5** (long-path-aware ninja) for all native modules. Do not
remove that override, and do not downgrade the SDK cmake package below
3.30.5 (`sdkmanager "cmake;3.30.5"`).

## Release checklist (every version)

1. `app.json` → bump `expo.version` and `expo.android.versionCode`.
2. `npx expo prebuild -p android --no-install` to sync native files.
3. `cd android && .\gradlew assembleRelease`.
4. Sanity-check on a device (`adb install -r`), then tag the commit
   (e.g. `mobile-v1.0.1`) and archive the APK.
5. Never commit `*.keystore`/`*.jks` or real passwords
   (`mobile/.gitignore` guards `*.jks`; the keystore lives outside the repo).

## Env

`mobile/.env.local` holds `EXPO_PUBLIC_SUPABASE_URL` +
`EXPO_PUBLIC_SUPABASE_ANON_KEY` (same project as `app/.env.local`).

## Verify

```
npx tsc --noEmit
npm test
```
