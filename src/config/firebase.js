import admin from "firebase-admin";

console.log('🔥 Initializing Firebase...');
console.log('Environment check:', {
  NODE_ENV: process.env.NODE_ENV,
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ? 'SET' : 'MISSING',
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ? 'SET' : 'MISSING',
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY ? 'SET (len=' + process.env.FIREBASE_PRIVATE_KEY.length + ')' : 'MISSING'
});

/**
 * Firebase Admin SDK — initialised once at startup.
 *
 * Required env variables (from the Firebase Console → Project Settings →
 * Service Accounts → Generate new private key):
 *
 *   FIREBASE_PROJECT_ID     e.g. my-nimbus-app
 *   FIREBASE_CLIENT_EMAIL   e.g. firebase-adminsdk-xxx@my-nimbus-app.iam.gserviceaccount.com
 *   FIREBASE_PRIVATE_KEY    The private key string (newlines as \n in the env file)
 *
 * On Render.com: paste each value as a separate environment variable.
 * The FIREBASE_PRIVATE_KEY must keep its "-----BEGIN PRIVATE KEY-----\n..." format;
 * Render stores it verbatim, so no extra escaping is needed there.
 */
if (!admin.apps.length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  console.log('Firebase Debug:', {
    NODE_ENV: process.env.NODE_ENV,
    hasProjectId: !!process.env.FIREBASE_PROJECT_ID,
    hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
    hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
    privateKeyLength: process.env.FIREBASE_PRIVATE_KEY?.length
  });

  // In development, allow missing Firebase config for testing
  if (process.env.NODE_ENV === 'development' && (!privateKey || !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL)) {
    console.warn("⚠️  Firebase Admin not configured - some features may not work");
    // Initialize with a dummy app for development
    admin.initializeApp({
      projectId: 'dev-project',
    });
  } else if (!privateKey || !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL) {
    throw new Error(
      "Firebase Admin is not configured. Set FIREBASE_PROJECT_ID, " +
      "FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in your .env file."
    );
  } else {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
    });
  }
}

export default admin;
