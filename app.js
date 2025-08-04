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