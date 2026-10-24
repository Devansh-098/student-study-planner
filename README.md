# Student Study Planner

## Live web app

Try the deployed web app: [https://student-study-planner-nine-sandy.vercel.app](https://student-study-planner-nine-sandy.vercel.app)

A study planner for tracking subjects, exams, tasks, weekly plans, progress, and focus sessions. The repository contains both the browser app and an Android app.

## Apps in this repository

| App | Folder | What it does |
| --- | --- | --- |
| Web app | Repository root | Runs in a modern browser. Sign in to sync planner data with Firebase, or continue offline in this browser. |
| Android app | [`android/`](android/) | Installs as an Android app, with reminders, notification support, local alarm audio selection, and Firebase sign-in and sync. |

## Features

- Subjects, exam dates, study tasks, weekly planning, progress tracking, and dark mode.
- Focus page with a Pomodoro timer, flip clock, task reminders, and alarm.
- Optional email and password accounts with Firebase Authentication and Firestore sync.
- Visible cloud-sync status, retry for failed saves, and JSON backup/restore.
- Local-only mode for using the web app without signing in.
- Android notifications and alarms. Task reminders are restored after reboot; Android asks for notification permission when needed.
- Privacy and data information at [`privacy.html`](privacy.html).
- Admin tools protected by a Firebase custom claim. See [Firebase admin setup](FIREBASE-ADMIN-SETUP.md).

## Run the web app

### Requirements

- A modern browser such as Chrome, Edge, or Firefox.
- A local web server. Opening `index.html` directly from File Explorer does not work reliably because the app uses JavaScript modules.
- Internet access for Firebase sign-in/sync, web fonts, and Firebase SDK modules. Offline mode stores data in the current browser only.

### Start a local server

**Option A: Visual Studio Code Live Server**

1. Open this repository folder in Visual Studio Code.
2. Install the **Live Server** extension if it is not installed.
3. Right-click the root `index.html` and choose **Open with Live Server**.
4. The app should open at an address similar to `http://127.0.0.1:5500`.

**Option B: Python**

Open a terminal in the repository root and run:

```powershell
python -m http.server 5500
```

Then open [http://localhost:5500](http://localhost:5500). Keep the terminal open while using the app; press `Ctrl+C` to stop the server.

### Sign in or use offline mode

On the welcome screen, sign in with an existing Firebase account, create an account, or select **Continue on this device**. Offline data stays in that browser and does not sync to another device. Sign in with the same Firebase account on web and Android to sync planner data.

## Build and install the Android app

### Requirements

- Android Studio with Android SDK Platform 37 installed.
- Internet access the first time Gradle syncs, so it can download the Android Gradle Plugin and libraries.
- An Android phone with USB debugging enabled, or an Android emulator.

The project uses Android Gradle Plugin 9.4.0 and Gradle 9.6.0. Android Studio can download the configured Gradle version during the first sync.

### Build and run in Android Studio

1. In Android Studio, choose **Open** and select this repository's `android` folder.
2. Wait for Gradle sync to finish. If Android Studio asks to install Android SDK Platform 37, accept.
3. Connect an Android phone with USB debugging enabled, or create/start an emulator.
4. Select the `app` run configuration and your device, then press **Run**.
5. Allow notifications when prompted if you want task reminders and alarms.

### Build a debug APK from Windows

Open PowerShell in the repository root and run:

```powershell
cd android
.\gradlew.bat assembleDebug
```

The APK is created at:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Copy that APK to your phone and open it to install. Android may ask you to allow installation from the app you used to open the APK. For a release build for distribution, create and protect a signing key in Android Studio; do not commit signing keys or passwords to GitHub.

## Firebase setup

This checkout is configured for the StudyPlanner Firebase project used by the app author. Firebase's web and Android client configuration files are included so the checked-in apps can connect to that project. These client configuration values identify the project; access is enforced by Firebase Authentication and the Firestore rules. Never add service-account keys, private signing keys, passwords, or local credential files to this repository.

To use a different Firebase project:

1. Create a Firebase project.
2. Enable **Authentication → Sign-in method → Email/Password**.
3. Create a **Cloud Firestore** database and publish the rules from [`firestore.rules`](firestore.rules).
4. Register a web app and replace the Firebase configuration in [`js/firebase.js`](js/firebase.js).
5. Register an Android app with application ID `com.studyplanner.app`, download its `google-services.json`, and replace `android/app/google-services.json`.
6. Add the domain where the web app is hosted under **Authentication → Settings → Authorized domains**. For local use, make sure `localhost` is allowed; add `127.0.0.1` too if you use that address.

Admin access is assigned by a trusted Firebase project owner using a custom claim; there is no shared admin password. Follow [FIREBASE-ADMIN-SETUP.md](FIREBASE-ADMIN-SETUP.md) only on a trusted computer. Do not place Firebase Admin credentials in the app or repository.

## Data and platform notes

- Offline web data is saved in that browser's LocalStorage. Clearing browser data can remove it.
- Signed-in planner data is stored in Firestore under the user's account and is shared between the web app and Android app.
- Settings shows whether cloud sync succeeded and lets users download or restore a JSON planner backup.
- Alarm audio selected on Android is a local file selection for that device. Web audio and browser alarms depend on browser permission and may not play while the page or device is asleep.
- Android scheduled reminders use system notifications and are rescheduled after reboot. Notification permission, silent mode, battery restrictions, and Do Not Disturb can still affect delivery or sound.
- The Android interface bundles its own copy of the web assets in `android/app/src/main/assets`, including `privacy.html`. Keep those copies aligned when changing the web interface.
- Build output, local Android SDK paths, and dependency folders are ignored by Git.

## Project layout

```text
.
├── index.html                    # Web app entry point
├── css/ and js/                  # Web styles and app logic
├── assets/                       # Web images
├── js/firebase.js                # Web Firebase Authentication and Firestore
├── firestore.rules               # Firestore security rules
├── scripts/                      # Trusted admin setup helper
└── android/                      # Android Studio project and bundled app assets
```
