// Import the Firebase Admin SDK
const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize the Firebase Admin SDK
admin.initializeApp();

// A callable function that requires authentication, deployed to europe-west1
exports.getUserNotesEurope = functions.region('europe-west1').https.onCall(async (data, context) => {
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

// An HTTP function that might optionally use authentication, deployed to europe-west1
exports.getPublicDataEurope = functions.region('europe-west1').https.onRequest(async (req, res) => {
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