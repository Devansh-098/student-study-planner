# Firebase admin setup

The admin console is protected with a Firebase Authentication custom claim. There is no shared or hard-coded admin password. Only a trusted Firebase project owner can assign or remove the `admin` role. Admins can view every account's planner subjects and tasks, pause or restore account access, and publish interface settings to signed-in web and Android clients.

## Publish Firestore security rules

Install the Firebase CLI with `npm install -g firebase-tools`, then from this folder run `firebase login` and `firebase deploy --only firestore:rules --project studyplanner-26d1f`. Or open Firebase Console → Firestore Database → Rules, replace the rules with `firestore.rules`, and click Publish. Publishing these rules limits ordinary accounts to their own planner document and reserves the `appConfig` collection and user list for admins.

## Grant administrator access

Use a trusted computer with Node.js and Google Cloud CLI installed. Sign in to the Firebase project as an owner, then from this folder run:

```powershell
npm install firebase-admin
firebase login
gcloud auth application-default login
node scripts/set-admin-claim.mjs your-account@example.com
```

The target Firebase Authentication account must exist. Run this only from a trusted computer signed in to a Firebase project owner account. To remove the admin role, run the same command with `--remove`. The account must sign out and back in to refresh its role.

Never share a service-account key, password, or Google Cloud credentials. Do not put them in this website or Android app.

## Notes

- The web version can play its chosen MP3 while the page is open and the browser permits audio playback. Browsers can suspend alarms when the page or device is asleep.
- Android schedules an OS notification with the selected local MP3 as its notification-channel sound. Android may require notifications enabled and the device not muted or in Do Not Disturb.




