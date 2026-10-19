import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const projectId = 'studyplanner-26d1f';
const [email, ...flags] = process.argv.slice(2);
const removeAdmin = flags.includes('--remove');

if (!email || flags.some(flag => flag !== '--remove')) {
  console.error('Usage: node scripts/set-admin-claim.mjs <account-email> [--remove]');
  process.exit(2);
}

initializeApp({ credential: applicationDefault(), projectId });

try {
  const auth = getAuth();
  const user = await auth.getUserByEmail(email);
  const claims = { ...(user.customClaims || {}) };
  if (removeAdmin) delete claims.admin;
  else claims.admin = true;
  await auth.setCustomUserClaims(user.uid, claims);
  console.log(`${removeAdmin ? 'Removed' : 'Granted'} admin access ${removeAdmin ? 'from' : 'to'} ${user.email} (${user.uid}).`);
  console.log('The user must sign out and sign in again before the new role appears in the app.');
} catch (error) {
  console.error(`Could not update the administrator role: ${error.message}`);
  process.exitCode = 1;
}

