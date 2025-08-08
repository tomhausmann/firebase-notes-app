// Import the Firebase Admin SDK
const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize the Firebase Admin SDK
admin.initializeApp();

// Set global options for all functions including the region
// This is the v6 way to configure regions globally
functions.setGlobalOptions({
  region: 'europe-west1'
});

// A callable function that requires authentication
// Note: No need to specify region here as it's set globally above
exports.getUserNotes = functions.https.onCall(async (data, context) => {
  // Check if the user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be authenticated to access your notes.'
    );
  }

  const userId = context.auth.uid;
  functions.logger.info(`Fetching notes for user: ${userId}`);

  try {
    // Fetch notes where the user is the owner
    const notesRef = admin.firestore().collection('notes');
    const snapshot = await notesRef.where('owner', '==', userId).get();

    const notes = [];
    snapshot.forEach(doc => {
      notes.push({ id: doc.id, ...doc.data() });
    });

    return { success: true, notes: notes };

  } catch (error) {
    functions.logger.error('Error fetching user notes:', error);
    throw new functions.https.HttpsError(
      'internal',
      'Failed to retrieve notes.',
      error.message
    );
  }
});

// An HTTP function for public data
// Also uses the global region setting
exports.getPublicData = functions.https.onRequest(async (req, res) => {
  try {
    const publicDataRef = admin.firestore().collection('publicData');
    const snapshot = await publicDataRef.get();

    const data = [];
    snapshot.forEach(doc => {
      data.push({ id: doc.id, ...doc.data() });
    });

    res.status(200).json({ success: true, data: data });

  } catch (error) {
    functions.logger.error('Error fetching public data:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve public data.' });
  }
});

// Add this new function to the bottom of your functions/index.js
exports.testAuth = functions.https.onCall((data, context) => {
  // This function's only purpose is to check for the auth context.
  functions.logger.info("--- testAuth function triggered ---");

  if (context.auth) {
    // If auth is present, log it and return success.
    functions.logger.info("SUCCESS: Authentication context was found.", {
      uid: context.auth.uid,
      email: context.auth.token.email, // We can even see details from the token
    });
    return { status: "Authenticated!", uid: context.auth.uid };
  } else {
    // If auth is NOT present, log a warning and return failure.
    functions.logger.warn("FAILURE: Authentication context was NOT found.");
    return { status: "Not authenticated." };
  }
});
