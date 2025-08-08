// Import the Firebase Admin SDK
const functions = require('firebase-functions');
const admin = require('firebase-admin');

// Initialize the Firebase Admin SDK
// This must be called before any other Firebase operations.
// It automatically picks up credentials when deployed to Firebase.
admin.initializeApp();

// Example: A callable function that requires authentication
// Callable functions automatically verify the Firebase ID token
// and provide the authenticated user's information in the context.
exports.getUserNotes = functions.https.onCall(async (data, context) => {
  // Check if the user is authenticated
  if (!context.auth) {
    // Throwing an HttpsError will send a structured error back to the client
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be authenticated to access your notes.'
    );
  }

  // The user's UID is available in context.auth.uid
  const userId = context.auth.uid;
  functions.logger.info(`Fetching notes for user: ${userId}`);

  try {
    // Access Firestore to get user-specific data
    // Replace 'notes' and 'userNotes' with your actual collection/document paths
    const userNotesRef = admin.firestore().collection('users').doc(userId).collection('userNotes');
    const snapshot = await userNotesRef.get();

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
      error.message // Optionally include the original error message for debugging
    );
  }
});

// Example: An HTTP function that might optionally use authentication
// For HTTP functions, you need to manually verify the ID token if authentication is required.
exports.getPublicData = functions.https.onRequest(async (req, res) => {
  // You can optionally check for an ID token in the Authorization header
  // This is more complex than callable functions for auth.
  // For simplicity, this example doesn't enforce authentication.

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
