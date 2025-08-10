// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, where, onSnapshot, deleteDoc, doc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// --- 1. FIREBASE CONFIGURATION ---
// In a production app, consider using a more secure way to handle these keys,
// such as Firebase Hosting's reserved URLs or environment variables.
const firebaseConfig = {
    apiKey: "AIzaSyCKLJ6m-qZjlljfmGlDuH4DzLizCNEy1oI",
    authDomain: "web-app-64e52.firebaseapp.com",
    projectId: "web-app-64e52",
    storageBucket: "web-app-64e52.appspot.com",
    messagingSenderId: "857746681854",
    appId: "1:857746681854:web:8845568c9e689737c19aaf",
    measurementId: "G-V8K2HEEF32"
};

// --- 2. INITIALIZE FIREBASE ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- 3. DOM ELEMENTS ---
const authContainer = document.getElementById('auth-container');
const appContainer = document.getElementById('app');
const googleSignInBtn = document.getElementById('google-signin-btn');
const signOutBtn = document.getElementById('signout-btn');
const userPhoto = document.getElementById('user-photo');
const userName = document.getElementById('user-name');
const userEmail = document.getElementById('user-email');
const userIdDisplay = document.getElementById('user-id-display');
const noteForm = document.getElementById('note-form');
const noteContent = document.getElementById('note-content');
const notesContainer = document.getElementById('notes-container');
const noteTemplate = document.getElementById('note-template');


// --- 4. STATE ---
let currentUser = null;
let notesListener = null;

// --- 5. AUTHENTICATION ---
function signInWithGoogle() {
    // Using signInWithPopup is often more reliable across different browser
    // security settings than signInWithRedirect.
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider)
        .catch(error => console.error("Sign in with popup failed", error));
}

function signOutUser() {
    signOut(auth).catch(error => console.error("Sign out failed", error));
}

function handleUserLogin(user) {
    currentUser = {
        uid: user.uid,
        name: user.displayName,
        email: user.email,
        photoURL: user.photoURL
    };

    authContainer.classList.add('hidden');
    appContainer.classList.remove('hidden');

    userPhoto.src = currentUser.photoURL || 'https://placehold.co/100x100/E2E8F0/4A5568?text=User';
    userName.textContent = currentUser.name;
    userEmail.textContent = currentUser.email;
    userIdDisplay.textContent = `User ID: ${currentUser.uid}`;

    listenForNotes();
}

function handleUserLogout() {
    currentUser = null;
    authContainer.classList.remove('hidden');
    appContainer.classList.add('hidden');
    notesContainer.innerHTML = '';
    if (notesListener) {
        notesListener(); // Unsubscribe from the listener
        notesListener = null;
    }
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        handleUserLogin(user);
    } else {
        handleUserLogout();
    }
});

// --- 6. FIRESTORE LOGIC ---

async function shareNote(noteId) {
    const collaboratorId = prompt("Enter the User ID of the person you want to share this note with:");
    if (!collaboratorId || collaboratorId.trim() === "") {
        alert("Invalid User ID.");
        return;
    }

    try {
        const noteRef = doc(db, "notes", noteId);
        await updateDoc(noteRef, {
            collaborators: arrayUnion(collaboratorId.trim())
        });
        alert("Note shared successfully!");
    } catch (e) {
        console.error("Error sharing note: ", e);
        alert("Failed to share note. See console for details.");
    }
}

async function deleteNote(noteId) {
    if (!currentUser || !noteId) return;
    await deleteDoc(doc(db, "notes", noteId));
}

function renderNote(note) {
    const noteData = note.data();
    const noteId = note.id;

    const noteElement = noteTemplate.content.cloneNode(true);
    const div = noteElement.firstElementChild;
    div.setAttribute('data-id', noteId);

    div.querySelector('.note-content').textContent = noteData.content;
    div.querySelector('.share-btn').onclick = () => shareNote(noteId);
    div.querySelector('.delete-btn').onclick = () => deleteNote(noteId);

    notesContainer.appendChild(noteElement);
}

function listenForNotes() {
    if (!currentUser) return;
    if (notesListener) notesListener(); // Detach old listener if one exists

    const notesRef = collection(db, "notes");
    // const q = query(notesRef, where("collaborators", "array-contains", currentUser.uid));
    // THIS IS THE FIXED LINE
    const q = query(notesRef, where("owner", "==", currentUser.uid));

    notesListener = onSnapshot(q, (querySnapshot) => {
        notesContainer.innerHTML = '';
        querySnapshot.forEach((doc) => {
            renderNote(doc);
        });
    }, (error) => {
        console.error("Error listening for notes:", error);
    });
}

async function addNote(event) {
    event.preventDefault();
    if (!currentUser) return;

    const content = noteContent.value.trim();
    if (!content) return;

    try {
        await addDoc(collection(db, "notes"), {
            content: content,
            createdAt: new Date(),
            owner: currentUser.uid,
            collaborators: [currentUser.uid]
        });
        noteContent.value = "";
    } catch (e) {
        console.error("Error adding document: ", e);
    }
}

// — CLOUD FUNCTIONS INTEGRATION —

// Function to get the current user’s ID token
async function getUserIdToken() {
    if (!currentUser || !auth.currentUser) {
        throw new Error('No authenticated user');
    }

    try {
        const idToken = await auth.currentUser.getIdToken(true); // true forces refresh
        return idToken;
    } catch (error) {
        console.error('Failed to get ID token:', error);
        throw error;
    }

}

// Function to export notes via Cloud Function
async function exportNotes() {
    const exportBtn = document.getElementById(‘export-notes-btn’);
    if (!exportBtn) return;

    // Show loading state
    const originalText = exportBtn.textContent;
    exportBtn.textContent = 'Exporting...';
    exportBtn.disabled = true;

    try {
        // Get fresh ID token
        const idToken = await getUserIdToken();
    
        // Call Cloud Function with proper authentication
        // Replace with your actual Cloud Function URL after deployment
        const functionUrl = 'https://us-central1-web-app-64e52.cloudfunctions.net/exportNotes';
    
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json'
            },
        body: JSON.stringify({}) // Can add parameters if needed
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Export failed');
    }
    
    const result = await response.json();
    
    if (result.success && result.data) {
        // Create downloadable JSON file
        const dataStr = JSON.stringify(result.data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        // Create temporary download link
        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = `notes_export_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        
        // Clean up
        URL.revokeObjectURL(url);
        
        // Show success message
        showNotification('Notes exported successfully!', 'success');
    }
    
} catch (error) {
    console.error('Export failed:', error);
    showNotification(`Export failed: ${error.message}`, 'error');
} finally {
    // Restore button state
    exportBtn.textContent = originalText;
    exportBtn.disabled = false;
}

}

// Function to view activity logs (optional - for demonstrating the event-driven function)
async function viewActivityLogs() {
    if (!currentUser) return;

    try {
        // Query recent activity logs
        const logsRef = collection(db, "activity_logs");
        const q = query(logsRef, where("userId", "==", currentUser.uid));
    
        const querySnapshot = await getDocs(q);
        const activities = [];
    
        querySnapshot.forEach((doc) => {
            activities.push({
                id: doc.id,
                ...doc.data()
            });
        });
    
        // Sort by timestamp
        activities.sort((a, b) => b.timestamp - a.timestamp);
    
        console.log('Recent activities:', activities);
    
        // You can display these in a modal or separate section
        displayActivityLogs(activities);
    
    } catch (error) {
        console.error('Failed to fetch activity logs:', error);
    }

}

// Helper function to display activity logs (optional)
function displayActivityLogs(activities) {
    // This is a simple implementation - you can enhance it with better UI
    const logContainer = document.getElementById('activity-logs-container');
    if (!logContainer) {
        console.log('Activity logs:', activities);
        return;
    }

    logContainer.innerHTML = '';

    if (activities.length === 0) {
        logContainer.innerHTML = '<p class="text-gray-500">No recent activity</p>';
        return;
    }

    activities.forEach(activity => {
        const logElement = document.createElement('div');
        logElement.className = 'bg-gray-50 p-3 rounded-md mb-2';
    
        const timestamp = activity.timestamp?.toDate?.() || new Date(activity.timestamp);
        const timeString = timestamp.toLocaleString();
    
        logElement.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <span class="font-medium capitalize">${activity.activityType}</span>
                    <span class="text-gray-600 text-sm ml-2">${timeString}</span>
                </div>
            </div>
        <p class="text-sm text-gray-700 mt-1">${activity.noteContent || 'No content'}</p>
        `;
    
        logContainer.appendChild(logElement);
    });

}

// Helper function to show notifications
function showNotification(message, type = ‘info’) {
    // Create notification element
    const notification = document.createElement(‘div’);
    notification.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 transition-all duration-300 transform translate-x-0`;

    // Style based on type
    if (type === 'success') {
        notification.className += ' bg-green-500 text-white';
    } else if (type === 'error') {
        notification.className += ' bg-red-500 text-white';
    } else {
        notification.className += ' bg-blue-500 text-white';
    }

    notification.textContent = message;
    document.body.appendChild(notification);

    // Auto-remove after 3 seconds
    setTimeout(() => {
        notification.style.transform = 'translateX(400px)';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);

}

// Add event listener for export button (add this to your existing event listeners section)
// You’ll need to add an export button to your HTML first
document.addEventListener('DOMContentLoaded', () => {
    const exportBtn = document.getElementById('export-notes-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportNotes);
    }

    const activityBtn = document.getElementById('view-activity-btn');
    if (activityBtn) {
        activityBtn.addEventListener('click', viewActivityLogs);
    }

});



// --- 7. EVENT LISTENERS ---
googleSignInBtn.addEventListener('click', signInWithGoogle);
signOutBtn.addEventListener('click', signOutUser);
noteForm.addEventListener('submit', addNote);

userIdDisplay.addEventListener('click', () => {
    if (currentUser && currentUser.uid) {
        navigator.clipboard.writeText(currentUser.uid).then(() => {
            alert('User ID copied to clipboard!');
        }).catch(err => {
            console.error('Could not copy text: ', err);
        });
    }
});