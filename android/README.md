# Study Planner for Android

The Android Studio project for the mobile app. For setup instructions covering both web and Android, see the [repository README](../README.md).

## Requirements

- Android Studio with Android SDK Platform 37.
- An Android device with USB debugging enabled or an emulator.
- Internet access for the first Gradle sync.

This project uses Android Gradle Plugin 9.4.0 and Gradle 9.6.0. Android Studio can download the Gradle version and Android dependencies during sync.

## Install and run from Android Studio

1. Open this `android` folder in Android Studio.
2. Wait for Gradle sync. Install Android SDK Platform 37 if prompted.
3. Connect a phone or start an emulator.
4. Choose the `app` run configuration and press **Run**.
5. Allow notifications if you want task reminders and alarms.

## Build an APK on Windows

From the repository root in PowerShell:

```powershell
cd android
.\gradlew.bat assembleDebug
```

The debug APK will be at `app/build/outputs/apk/debug/app-debug.apk`. Copy it to an Android phone and open it to install. Android may ask you to permit installs from the app opening the APK. For distribution, create a signed release build in Android Studio and keep the signing key and its passwords private.

## Firebase and data

The app uses the included `app/google-services.json` to connect to the repository's configured Firebase project. It supports Firebase email/password sign-in and stores signed-in planner data in Firestore, shared with the web app. Firestore access is controlled by the repository's `firestore.rules`.

If using a different Firebase project, register an Android app with application ID `com.studyplanner.app` and replace `app/google-services.json`. Also update the web Firebase configuration and publish the matching Firestore rules; the full instructions are in the [repository README](../README.md#firebase-setup).

The planner interface is bundled in `app/src/main/assets`. Keep its HTML, CSS, JavaScript, and images aligned with the matching web app files when changing the UI.
