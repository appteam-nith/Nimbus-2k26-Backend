import admin from "firebase-admin";

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

  if (!privateKey || !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL) {
    throw new Error(
      "Firebase Admin is not configured. Set FIREBASE_PROJECT_ID, " +
      "FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in your .env file."
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

export default admin;
