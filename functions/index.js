const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });

// Initialize Admin SDK
admin.initializeApp();
const db = admin.firestore();

// HTTP-triggered function: Export user’s notes
// This demonstrates authentication, CORS handling, and data processing
exports.exportNotes = functions.https.onRequest(async (req, res) => {
// Handle CORS - crucial for web app integration
return cors(req, res, async () => {
// Only accept POST requests for security
if (req.method !== 'POST') {
return res.status(405).json({ error: 'Method not allowed' });
}

    try {
        // Extract and verify the ID token from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Unauthorized: No token provided' });
        }

        const idToken = authHeader.split('Bearer ')[1];
        
        // Verify the token and get user info
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const userId = decodedToken.uid;
        const userEmail = decodedToken.email;

        console.log(`Export requested by user: ${userId}`);

        // Query notes where user is owner or collaborator
        const ownerQuery = db.collection('notes')
            .where('owner', '==', userId);
        
        const collaboratorQuery = db.collection('notes')
            .where('collaborators', 'array-contains', userId);

        // Execute both queries in parallel for efficiency
        const [ownerSnapshot, collaboratorSnapshot] = await Promise.all([
            ownerQuery.get(),
            collaboratorQuery.get()
        ]);

        // Combine and deduplicate results
        const notesMap = new Map();
        
        ownerSnapshot.forEach(doc => {
            notesMap.set(doc.id, {
                id: doc.id,
                ...doc.data(),
                isOwner: true,
                createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt
            });
        });

        collaboratorSnapshot.forEach(doc => {
            if (!notesMap.has(doc.id)) {
                notesMap.set(doc.id, {
                    id: doc.id,
                    ...doc.data(),
                    isOwner: false,
                    createdAt: doc.data().createdAt?.toDate?.() || doc.data().createdAt
                });
            }
        });

        // Convert to array and sort by creation date
        const notes = Array.from(notesMap.values())
            .sort((a, b) => {
                const dateA = new Date(a.createdAt);
                const dateB = new Date(b.createdAt);
                return dateB - dateA; // Newest first
            });

        // Prepare export data with metadata
        const exportData = {
            exportDate: new Date().toISOString(),
            userEmail: userEmail,
            userId: userId,
            totalNotes: notes.length,
            ownedNotes: notes.filter(n => n.isOwner).length,
            sharedNotes: notes.filter(n => !n.isOwner).length,
            notes: notes.map(note => ({
                content: note.content,
                createdAt: note.createdAt,
                isOwner: note.isOwner,
                collaborators: note.collaborators || [],
                noteId: note.id
            }))
        };

        // Log successful export for monitoring
        console.log(`Successfully exported ${notes.length} notes for user ${userId}`);

        // Return formatted JSON with appropriate headers
        res.status(200).json({
            success: true,
            data: exportData
        });

    } catch (error) {
        console.error('Export error:', error);
        
        // Provide specific error messages for common issues
        if (error.code === 'auth/id-token-expired') {
            return res.status(401).json({ 
                error: 'Token expired. Please sign in again.' 
            });
        } else if (error.code === 'auth/argument-error') {
            return res.status(401).json({ 
                error: 'Invalid token format.' 
            });
        }
        
        // Generic error response
        res.status(500).json({ 
            error: 'Failed to export notes',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

});

// Event-driven function: Log note activities
// This demonstrates Firestore triggers and automatic background processing
exports.logNoteActivity = functions.firestore
.document('notes/{noteId}')
.onWrite(async (change, context) => {
const noteId = context.params.noteId;

    // Determine the type of activity
    let activityType;
    let noteData;
    
    if (!change.before.exists && change.after.exists) {
        // Document was created
        activityType = 'created';
        noteData = change.after.data();
    } else if (change.before.exists && !change.after.exists) {
        // Document was deleted
        activityType = 'deleted';
        noteData = change.before.data();
    } else {
        // Document was updated
        activityType = 'updated';
        noteData = change.after.data();
    }

    // Create activity log entry
    const activityLog = {
        noteId: noteId,
        activityType: activityType,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        userId: noteData.owner,
        noteContent: noteData.content?.substring(0, 100), // Store first 100 chars
        collaborators: noteData.collaborators || []
    };

    try {
        // Store in a separate activity collection
        await db.collection('activity_logs').add(activityLog);
        console.log(`Activity logged: ${activityType} note ${noteId}`);
        
        // Optional: Clean up old logs (keep only last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const oldLogsQuery = await db.collection('activity_logs')
            .where('timestamp', '<', thirtyDaysAgo)
            .limit(100) // Batch delete in chunks
            .get();
        
        const batch = db.batch();
        oldLogsQuery.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        if (oldLogsQuery.size > 0) {
            await batch.commit();
            console.log(`Cleaned up ${oldLogsQuery.size} old activity logs`);
        }
        
    } catch (error) {
        console.error('Failed to log activity:', error);
        // Don't throw - we don't want to fail the main operation
    }
});

// Optional: Scheduled function example - Daily summary
// Demonstrates scheduled triggers (runs daily at 2 AM)
exports.dailySummary = functions.pubsub
.schedule('0 2 * * *')
.timeZone('America/New_York')
.onRun(async (context) => {
console.log('Running daily summary...');

    try {
        // Get all activity from the last 24 hours
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        const activitySnapshot = await db.collection('activity_logs')
            .where('timestamp', '>=', yesterday)
            .get();
        
        const summary = {
            date: new Date().toISOString(),
            totalActivities: activitySnapshot.size,
            notesCreated: 0,
            notesUpdated: 0,
            notesDeleted: 0,
            activeUsers: new Set()
        };
        
        activitySnapshot.forEach(doc => {
            const data = doc.data();
            summary.activeUsers.add(data.userId);
            
            switch(data.activityType) {
                case 'created':
                    summary.notesCreated++;
                    break;
                case 'updated':
                    summary.notesUpdated++;
                    break;
                case 'deleted':
                    summary.notesDeleted++;
                    break;
            }
        });
        
        // Store summary
        await db.collection('daily_summaries').add({
            ...summary,
            activeUsers: Array.from(summary.activeUsers),
            activeUserCount: summary.activeUsers.size,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log('Daily summary completed:', summary);
        
    } catch (error) {
        console.error('Daily summary failed:', error);
    }
});