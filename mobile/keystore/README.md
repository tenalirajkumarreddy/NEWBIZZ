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

## GitHub Actions release

The release workflow reads these repository secrets
(Settings → Secrets and variables → Actions → Secrets):

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Base64 of `newbizz-release.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore store password |
| `ANDROID_KEY_ALIAS` | `newbizz` |
| `ANDROID_KEY_PASSWORD` | Key password |
| `ANDROID_CERT_SHA256` | Optional. Expected signing certificate SHA-256; the release fails if it does not match. Recommended. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Publishable anon key used at bundle time |
| `GOOGLE_SERVICES_JSON_BASE64` | Optional FCM `google-services.json`, Base64 encoded |

Repository variables (Settings → Secrets and variables → Actions → Variables):

| Variable | Default |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | `https://wmpxwpubfxpexybqnynz.supabase.co` |
| `EXPO_PUBLIC_WEB_URL` | `https://aquaprime-app.vercel.app` |

Encode the keystore without printing it:

```bash
# macOS / Linux
base64 < ~/.newbizz/newbizz-release.keystore | tr -d '\n' > /tmp/newbizz.keystore.b64
gh secret set ANDROID_KEYSTORE_BASE64 < /tmp/newbizz.keystore.b64
rm /tmp/newbizz.keystore.b64
```

```powershell
# Windows PowerShell
$b64 = [Convert]::ToBase64String(
  [IO.File]::ReadAllBytes("$env:USERPROFILE\.newbizz\newbizz-release.keystore")
)
gh secret set ANDROID_KEYSTORE_BASE64 --body $b64
```

Read the certificate fingerprint from a signed build:

```bash
apksigner verify --print-certs mobile/android/app/build/outputs/apk/release/app-release.apk
```

Copy the `Signer #1 certificate SHA-256 digest` value (colons are fine) into
`ANDROID_CERT_SHA256`.

For FCM, encode `mobile/google-services.json` the same way and store it as
`GOOGLE_SERVICES_JSON_BASE64`. If it is absent, the build still succeeds but
push notifications are not configured.

The workflow decodes the keystore into `$RUNNER_TEMP`, validates the alias and
store password with `keytool`, builds with `-P` Gradle properties, and never
prints a secret value.

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
