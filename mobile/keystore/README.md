# NEWBIZZ Android release keystore

The release keystore is **not stored in this repository**. It lives on each
release machine at:

```
%USERPROFILE%\.newbizz\newbizz-release.keystore   (PKCS12, alias: newbizz)
```

Generated once per machine with (non-interactive):

```
keytool -genkeypair -v -storetype PKCS12 `
  -keystore "$env:USERPROFILE\.newbizz\newbizz-release.keystore" `
  -alias newbizz -keyalg RSA -keysize 2048 -validity 10000 `
  -storepass <STORE_PASSWORD> -keypass <KEY_PASSWORD> `
  -dname "CN=NEWBIZZ, OU=Mobile, O=NEWBIZZ, L=Salem, ST=TamilNadu, C=IN"
```

## Where the passwords live

**Never commit passwords.** They are kept in a **local, uncommitted** Gradle
properties file:

```
%USERPROFILE%\.gradle\gradle.properties   (GRADLE_USER_HOME overrides)
```

with:

```
NEWBIZZ_UPLOAD_STORE_FILE=C:/Users/<you>/.newbizz/newbizz-release.keystore
NEWBIZZ_UPLOAD_STORE_PASSWORD=<real password>
NEWBIZZ_UPLOAD_KEY_ALIAS=newbizz
NEWBIZZ_UPLOAD_KEY_PASSWORD=<real password>
```

`mobile/android/gradle.properties` (committed) contains **placeholder** values
for these keys with the same names. Gradle gives `GRADLE_USER_HOME`
properties precedence over project ones, so a machine with the local override
builds signed; any other machine automatically falls back to debug signing
(see the `signingConfigs.release` block in `mobile/android/app/build.gradle`)
so everyday builds still succeed.

**Back up the keystore + passwords safely** (password manager / offline
storage). Losing the keystore means losing the ability to update the app on
devices that installed a previous release.

## Build a signed release APK

```
cd mobile
npm install --legacy-peer-deps
npx expo prebuild -p android --no-install   # only when app.json/plugins changed
cd android
.\gradlew assembleRelease
```

Output: `mobile/android/app/build/outputs/apk/release/app-release.apk`

Install on a connected device: `adb install -r app-release.apk`

## versionCode bump checklist (every release)

1. `mobile/app.json` → `expo.android.versionCode` (+1) and `expo.version`
   (user-visible version).
2. Re-run `npx expo prebuild -p android --no-install` to sync native files.
3. Build `.\gradlew assembleRelease`.
4. Tag the commit (e.g. `mobile-v1.0.1`) and archive the APK.

Note: the first local build downloads the Gradle distribution and all
native dependencies — allow 10–20 minutes.
