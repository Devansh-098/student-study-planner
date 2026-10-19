# Study Planner for Android

## Open and run

1. In Android Studio, choose **Open** and select this `android` folder.
2. Allow Gradle sync to download the build plugins and AndroidX WebKit. Keep Android Studio online during the first sync.
3. If prompted to install an SDK, choose Android SDK Platform 37.
4. Select the `Medium_Phone_API_37.0` emulator or a connected Android phone, then run the `app` configuration.

The project uses Android Gradle Plugin 9.4.0 with Gradle 9.6.0 to match the API 37 SDK installed on this computer. Android Gradle Plugin 9.4 supports API 37 and requires Gradle 9.6.0.

## What is included

The app is a native Android shell around the existing planner interface. HTML, styles, scripts, and the logo are bundled under `app/src/main/assets`. Android's `WebViewAssetLoader` serves these files at a secure in-app HTTPS origin. The planner saves to Android WebView LocalStorage on this device.

Sign-in is currently a non-functional placeholder. It does not transmit or save credentials. The web app and this Android app do not share data yet; that needs a real account service and server-side sync.
