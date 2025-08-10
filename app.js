// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getFirestore, collection, addDoc, query, where, onSnapshot, deleteDoc, doc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    GoogleAuthProvider, 
    signInWithPopup, 
    signInWithRedirect,
    getRedirectResult,
    signOut 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// --- 1. FIREBASE CONFIGURATION ---
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

// Detect if we're on iOS/iPadOS Safari
function isIOSSafari() {
    const ua = navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const webkit = /WebKit/.test(ua);
    const standalone = window.navigator.standalone;
    return iOS && webkit && !standalone;
}

// Unified sign-in function that chooses the appropriate method
function signInWithGoogle() {
    const provider = new GoogleAuthProvider();
    
    // Show loading state on button
    const originalText = googleSignInBtn.textContent;
    googleSignInBtn.textContent = 'Signing in...';
    googleSignInBtn.disabled = true;
    
    // Use redirect for iOS/iPadOS Safari, popup for everything else
    if (isIOSSafari()) {
        console.log('Using redirect method for iOS Safari');
        signInWithRedirect(auth, provider)
            .catch(error => {
                console.error("Sign in with redirect failed", error);
                // Restore button state on error
                googleSignInBtn.textContent = originalText;
                googleSignInBtn.disabled = false;
            });
    } else {
        console.log('Using popup method');
        signInWithPopup(auth, provider)
            .catch(error => {
                console.error("Sign in with popup failed", error);
                // Fallback to redirect if popup fails
                if (error.code === 'auth/popup-blocked' || 
                    error.code === 'auth/cancelled-popup-request') {
                    console.log('Popup blocked, falling back to redirect');
                    signInWithRedirect(auth, provider);
                } else {
                    // Restore button state on other errors
                    googleSignInBtn.textContent = originalText;
                    googleSignInBtn.disabled = false;
                }
            });
    }
}

// Handle redirect result when page loads
async function handleRedirectResult() {
    try {
        const result = await getRedirectResult(auth);
        if (result && result.user) {
            console.log('Successfully signed in via redirect');
            // The onAuthStateChanged listener will handle the rest
        }
    } catch (error) {
        console.error('Redirect sign-in error:', error);
        // Restore button state if there was an error
        if (googleSignInBtn) {
            googleSignInBtn.textContent = 'Sign in with Google';
            googleSignInBtn.disabled = false;
        }
    }
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
    
    // Restore button state when login is successful
    if (googleSignInBtn) {
        googleSignInBtn.textContent = 'Sign in with Google';
        googleSignInBtn.disabled = false;
    }

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

// Check for redirect result on page load
handleRedirectResult();

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

async function getUserIdToken() {
    if (!currentUser || !auth.currentUser) {
        throw new Error('No authenticated user');
    }

    try {
        const idToken = await auth.currentUser.getIdToken(true);
        return idToken;
    } catch (error) {
        console.error('Failed to get ID token:', error);
        throw error;
    }
}

async function exportNotes() {
    const exportBtn = document.getElementById('export-notes-btn');
    if (!exportBtn) return;

    const originalText = exportBtn.textContent;
    exportBtn.textContent = 'Exporting...';
    exportBtn.disabled = true;

    try {
        const idToken = await getUserIdToken();
        const functionUrl = 'https://us-central1-web-app-64e52.cloudfunctions.net/exportNotes';
    
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });
    
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Export failed');
        }
    
        const result = await response.json();
    
        if (result.success && result.data) {
            const dataStr = JSON.stringify(result.data, null, 2);
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            
            const downloadLink = document.createElement('a');
            downloadLink.href = url;
            downloadLink.download = `notes_export_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            
            URL.revokeObjectURL(url);
            showNotification('Notes exported successfully!', 'success');
        }
    } catch (error) {
        console.error('Export failed:', error);
        showNotification(`Export failed: ${error.message}`, 'error');
    } finally {
        exportBtn.textContent = originalText;
        exportBtn.disabled = false;
    }
}

async function viewActivityLogs() {
    if (!currentUser) return;

    try {
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
    
        activities.sort((a, b) => b.timestamp - a.timestamp);
        console.log('Recent activities:', activities);
        displayActivityLogs(activities);
    } catch (error) {
        console.error('Failed to fetch activity logs:', error);
    }
}

function displayActivityLogs(activities) {
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

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 transition-all duration-300 transform translate-x-0';

    if (type === 'success') {
        notification.className += ' bg-green-500 text-white';
    } else if (type === 'error') {
        notification.className += ' bg-red-500 text-white';
    } else {
        notification.className += ' bg-blue-500 text-white';
    }

    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.transform = 'translateX(400px)';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

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