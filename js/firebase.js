import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js';
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyD-OV6keILOr4GumuGpL8XkD6G48VP9JNA',
  authDomain: 'studyplanner-26d1f.firebaseapp.com',
  projectId: 'studyplanner-26d1f',
  storageBucket: 'studyplanner-26d1f.firebasestorage.app',
  messagingSenderId: '693071258411',
  appId: '1:693071258411:web:23b96ebb539638a7381b6e'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getFirestore(app);
let stopWatchingPlanner = null;
let lastPlannerJson = null;
let authResolvedOnce = false;
let initialSnapshotHandled = false;
let stopWatchingInterface = null;

async function requireAdmin() {
  const user = auth.currentUser;
  if (!user) throw new Error('Sign in with an administrator account.');
  const token = await user.getIdTokenResult(true);
  if (token.claims.admin !== true) throw new Error('This Firebase account does not have administrator access.');
  return user;
}

function callbackAdminError(error) {
  window.onAdminOperation?.(false, error?.message || 'This action was blocked. Check admin access and Firestore rules.');
}

function showAuthError(error) {
  const messages = {
    'auth/email-already-in-use': 'An account already uses this email. Choose Sign in instead.',
    'auth/invalid-credential': 'Email or password is incorrect. Check them and try again.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Choose a password with at least 6 characters.',
    'auth/network-request-failed': 'Could not connect. Check your internet and try again.',
    'permission-denied': 'Firebase blocked access to the planner. Check the Firestore Rules.'
  };
  const message = messages[error?.code] || 'Could not connect to your account. Please try again.';
  if (auth.currentUser) window.onFirebaseSyncState?.('error');
  else window.onFirebaseLoginResult?.(false, '', message);
}

window.StudyPlannerFirebase = {
  signIn(email, password) {
    signInWithEmailAndPassword(auth, email, password).catch(showAuthError);
  },
  createAccount(email, password) {
    createUserWithEmailAndPassword(auth, email, password).catch(showAuthError);
  },
  signOut() {
    signOut(auth).catch(showAuthError);
  },
  savePlannerData(plannerJson) {
    const user = auth.currentUser;
    if (!user) return;
    if (plannerJson === lastPlannerJson) {
      window.onFirebaseSyncState?.('synced');
      return;
    }
    window.onFirebaseSyncState?.('syncing');
    return setDoc(doc(database, 'users', user.uid), {
      plannerJson,
      email: user.email || '',
      updatedAt: serverTimestamp()
    }, { merge: true }).then(() => {
      lastPlannerJson = plannerJson;
      window.onFirebaseSyncState?.('synced');
    }).catch(error => {
      window.onFirebaseSyncState?.('error');
      if (error?.code === 'permission-denied') showAuthError(error);
    });
  },
  async loadAdminUsers() {
    try {
      await requireAdmin();
      const snapshot = await getDocs(collection(database, 'users'));
      const users = snapshot.docs.map(userDoc => {
        const data = userDoc.data();
        let planner = {};
        try { planner = JSON.parse(data.plannerJson || '{}'); } catch (_) { }
        return {
          uid: userDoc.id,
          email: data.email || '',
          disabled: data.disabled === true,
          studentName: planner.studentName || '',
          subjects: Array.isArray(planner.subjects) ? planner.subjects : [],
          tasks: Array.isArray(planner.tasks) ? planner.tasks : []
        };
      });
      window.onAdminUsersLoaded?.(JSON.stringify(users));
    } catch (error) { callbackAdminError(error); }
  },
  async setUserDisabled(uid, disabled) {
    try {
      const user = await requireAdmin();
      if (user.uid === uid) throw new Error('You cannot pause your own administrator account.');
      await updateDoc(doc(database, 'users', uid), { disabled: disabled === true, accessUpdatedAt: serverTimestamp() });
      window.onAdminOperation?.(true, 'Account access updated.');
    } catch (error) { callbackAdminError(error); }
  },
  async saveInterfaceConfig(configJson) {
    try {
      await requireAdmin();
      const config = JSON.parse(configJson);
      await setDoc(doc(database, 'appConfig', 'interface'), { ...config, updatedAt: serverTimestamp() }, { merge: true });
      window.onAdminOperation?.(true, 'Published to the website and Android app.');
    } catch (error) { callbackAdminError(error); }
  }
};

onAuthStateChanged(auth, user => {
  stopWatchingPlanner?.();
  stopWatchingPlanner = null;
  stopWatchingInterface?.();
  stopWatchingInterface = null;
  initialSnapshotHandled = false;

  if (!user) {
    window.onFirebaseAdminAccess?.(false);
    if (authResolvedOnce) window.onFirebaseSignedOut?.();
    authResolvedOnce = true;
    lastPlannerJson = null;
    return;
  }

  authResolvedOnce = true;
  user.getIdTokenResult(true).then(token => window.onFirebaseAdminAccess?.(token.claims.admin === true)).catch(() => window.onFirebaseAdminAccess?.(false));
  setDoc(doc(database, 'users', user.uid), { email: user.email || '' }, { merge: true }).catch(() => {});
  stopWatchingInterface = onSnapshot(doc(database, 'appConfig', 'interface'), snapshot => {
    window.onGlobalPlannerConfig?.(snapshot.exists() ? snapshot.data() : null);
  });
  const plannerRef = doc(database, 'users', user.uid);
  stopWatchingPlanner = onSnapshot(plannerRef, snapshot => {
    if (snapshot.exists() && snapshot.data().disabled === true) {
      window.onFirebaseSuspended?.();
      signOut(auth).catch(() => {});
      return;
    }
    const plannerJson = snapshot.exists() ? snapshot.data().plannerJson || null : null;
    if (!initialSnapshotHandled) {
      initialSnapshotHandled = true;
      lastPlannerJson = plannerJson;
      window.onFirebaseLoginResult?.(true, user.email || '', plannerJson);
      return;
    }

    if (plannerJson && plannerJson !== lastPlannerJson) {
      lastPlannerJson = plannerJson;
      window.onFirebaseCloudData?.(plannerJson);
    }
  }, showAuthError);
});
