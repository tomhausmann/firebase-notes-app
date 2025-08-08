// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    query,
    where,
    or,  // NEW: Import ‘or’ for compound queries
    onSnapshot,
    deleteDoc,
    doc,
    updateDoc,
    arrayUnion
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
// NEW: Import Firebase Functions client SDK
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";


// — 1. FIREBASE CONFIGURATION —
const firebaseConfig = {
    apiKey: "AIzaSyCKLJ6m-qZjlljfmGlDuH4DzLizCNEy1oI",
    authDomain: "web-app-64e52.firebaseapp.com",
    projectId: "web-app-64e52",
    storageBucket: "web-app-64e52.appspot.com",
    messagingSenderId: "857746681854",
    appId: "1:857746681854:web:8845568c9e689737c19aaf",
    measurementId: "G-V8K2HEEF32"
};

// — 2. INITIALIZE FIREBASE —
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
// NEW: Initialize Firebase Functions
const functions = getFunctions(app); // You can specify a region: getFunctions(app, 'europe-west1');


// — 3. DOM ELEMENTS —
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
// NEW: DOM elements for cloud function interaction
const callFunctionBtn = document.getElementById('call-function-btn');
const functionResponseDiv = document.getElementById('function-response');


// — 4. STATE —
let currentUser = null;
let notesListener = null;

// — 5. AUTHENTICATION —
function signInWithGoogle() {
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

    // NEW: Enable cloud function button if it exists
    if (callFunctionBtn) {
        callFunctionBtn.disabled = false;
    }
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
    // NEW: Disable cloud function button on logout
    if (callFunctionBtn) {
        callFunctionBtn.disabled = true;
        functionResponseDiv.textContent = ''; // Clear previous response
    }
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        handleUserLogin(user);
    } else {
        handleUserLogout();
    }
});

// — 6. FIRESTORE LOGIC —

async function shareNote(noteId) {
    // IMPORTANT: Use a custom modal for prompts/confirms instead of built-in browser ones
    // as they won't show up in the Canvas environment.
    // For this example, I'll keep `prompt` and `confirm` for brevity,
    // but in a real app, replace them with custom UI.
    const collaboratorId = prompt("Enter the User ID of the person you want to share this note with:");
    if (!collaboratorId || collaboratorId.trim() === "") {
        alert("Invalid User ID.");
        return;
    }

    // Don't allow sharing with yourself
    if (collaboratorId.trim() === currentUser.uid) {
        alert("You already have access to this note!");
        return;
    }

    try {
        const noteRef = doc(db, "notes", noteId);
        // arrayUnion ensures we don't add duplicate IDs to the array
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

    // IMPORTANT: Use a custom modal for prompts/confirms instead of built-in browser ones
    // as they won't show up in the Canvas environment.
    if (confirm("Are you sure you want to delete this note?")) {
        await deleteDoc(doc(db, "notes", noteId));
    }

}

function renderNote(note) {
    const noteData = note.data();
    const noteId = note.id;

    const noteElement = noteTemplate.content.cloneNode(true);
    const div = noteElement.firstElementChild;
    div.setAttribute('data-id', noteId);

    // Display the note content
    div.querySelector('.note-content').textContent = noteData.content;

    // Add visual indicator if this is a shared note (not owned by current user)
    if (noteData.owner !== currentUser.uid) {
        div.classList.add('border-l-4', 'border-blue-500');
        // Optionally, add a "shared" badge or indicator
        const sharedIndicator = document.createElement('span');
        sharedIndicator.className = 'text-xs text-blue-600 font-semibold';
        sharedIndicator.textContent = ' (Shared with you)';
        div.querySelector('.note-content').appendChild(sharedIndicator);
    }

    // Only show share button for notes you own
    const shareBtn = div.querySelector('.share-btn');
    if (noteData.owner === currentUser.uid) {
        shareBtn.onclick = () => shareNote(noteId);
    } else {
        // Hide share button for notes you don't own
        shareBtn.style.display = 'none';
    }

    // Only allow deletion for notes you own (optional: you might want collaborators to delete too)
    const deleteBtn = div.querySelector('.delete-btn');
    if (noteData.owner === currentUser.uid) {
        deleteBtn.onclick = () => deleteNote(noteId);
    } else {
        // Optionally hide delete button for shared notes, or change its behavior
        deleteBtn.style.display = 'none';
    }

    notesContainer.appendChild(noteElement);

}

function listenForNotes() {
    if (!currentUser) return;
    if (notesListener) notesListener(); // Detach old listener if one exists

    const notesRef = collection(db, "notes");

    // COMPOUND QUERY: Fetch notes where the user is EITHER the owner OR a collaborator
    // This uses the 'or' operator to combine two conditions
    const q = query(
        notesRef,
        or(
            where("owner", "==", currentUser.uid),
            where("collaborators", "array-contains", currentUser.uid)
        )
    );

    // IMPORTANT: When you first run this, you'll likely see an error in the console like:
    // "The query requires an index. You can create it here: [URL]"
    // Click that URL to automatically create the required index in Firebase Console!

    notesListener = onSnapshot(q, (querySnapshot) => {
        notesContainer.innerHTML = '';

        // Sort notes: owned notes first, then shared notes
        const ownedNotes = [];
        const sharedNotes = [];

        querySnapshot.forEach((doc) => {
            const noteData = doc.data();
            if (noteData.owner === currentUser.uid) {
                ownedNotes.push(doc);
            } else {
                sharedNotes.push(doc);
            }
        });

        // Render owned notes first, then shared notes
        [...ownedNotes, ...sharedNotes].forEach(doc => renderNote(doc));

    }, (error) => {
        console.error("Error listening for notes:", error);

        // Check if this is an index error
        if (error.code === 'failed-precondition' && error.message.includes('index')) {
            console.error("🔥 FIREBASE INDEX REQUIRED 🔥");
            console.error("Click the link in the error message above to create the required index.");
            console.error("This is a one-time setup. After creating the index, refresh the page.");

            // Show user-friendly message
            notesContainer.innerHTML = `
                <div class="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 rounded">
                    <p class="font-bold">Database Index Required</p>
                    <p>This app needs a database index to work properly. Check the browser console for a link to create it.</p>
                    <p class="text-sm mt-2">This is a one-time setup that takes about 2-5 minutes.</p>
                </div>
            `;
        }
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
            collaborators: [currentUser.uid] // Owner is always a collaborator
        });
        noteContent.value = "";
    } catch (e) {
        console.error("Error adding document: ", e);
    }

}

// — 7. CLOUD FUNCTIONS INTEGRATION —
async function callGetUserNotesFunction() {
    if (!currentUser) {
        functionResponseDiv.textContent = 'Please sign in to call this function.';
        return;
    }

    functionResponseDiv.textContent = 'Calling cloud function...';
    try {
        // Get a reference to the callable function
        // 'getUserNotes' must match the name of your function in functions/index.js
        const getUserNotes = httpsCallable(functions, 'getUserNotes');

        // Call the function. The data object can be anything you want to send.
        // For getUserNotes, we don't need to send any specific data, but it's good practice
        // to pass an empty object if no data is required.
        const result = await getUserNotes({});

        // The result.data contains the response from your cloud function
        console.log('Cloud function response:', result.data);
        functionResponseDiv.textContent = `Function Response: ${JSON.stringify(result.data.notes.map(n => n.content))}`;

    } catch (error) {
        console.error("Error calling cloud function:", error);
        // Handle specific HttpsError codes if needed
        if (error.code === 'unauthenticated') {
            functionResponseDiv.textContent = 'Error: You are not authenticated to call this function.';
        } else {
            functionResponseDiv.textContent = `Error calling function: ${error.message}`;
        }
    }
}


// — 8. EVENT LISTENERS —
googleSignInBtn.addEventListener('click', signInWithGoogle);
signOutBtn.addEventListener('click', signOutUser);
noteForm.addEventListener('submit', addNote);
// NEW: Event listener for the cloud function button
if (callFunctionBtn) {
    callFunctionBtn.addEventListener('click', callGetUserNotesFunction);
    callFunctionBtn.disabled = true; // Disable until user is logged in
}


// Copy User ID to clipboard functionality
userIdDisplay.addEventListener('click', () => {
    if (currentUser && currentUser.uid) {
        // Using document.execCommand('copy') for better iframe compatibility
        const tempInput = document.createElement('textarea');
        tempInput.value = currentUser.uid;
        document.body.appendChild(tempInput);
        tempInput.select();
        try {
            document.execCommand('copy');
            // Create a temporary tooltip effect
            const originalText = userIdDisplay.textContent;
            userIdDisplay.textContent = 'Copied to clipboard!';
            userIdDisplay.classList.add('text-green-600');

            setTimeout(() => {
                userIdDisplay.textContent = originalText;
                userIdDisplay.classList.remove('text-green-600');
            }, 2000);
        } catch (err) {
            console.error('Could not copy text: ', err);
            alert('Could not copy User ID. Please select and copy manually: ' + currentUser.uid);
        } finally {
            document.body.removeChild(tempInput);
        }
    }
});
