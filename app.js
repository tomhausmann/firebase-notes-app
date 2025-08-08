 // Import the functions you need from the SDKs you need
        import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { getFirestore, collection, addDoc, doc, updateDoc, arrayUnion, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
        import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        // **NEW**: Import the functions SDK
        import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-functions.js";

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
        // **NEW**: Initialize Cloud Functions and point to the correct region
        const functions = getFunctions(app, 'europe-west1');

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

        // --- 5. AUTHENTICATION ---
        function signInWithGoogle() {
            const provider = new GoogleAuthProvider();
            signInWithPopup(auth, provider).catch(error => console.error("Sign in failed", error));
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
            
            // Call the function to fetch notes when the user logs in
            fetchAndRenderNotes();
        }

        function handleUserLogout() {
            currentUser = null;
            authContainer.classList.remove('hidden');
            appContainer.classList.add('hidden');
            notesContainer.innerHTML = '';
        }

        onAuthStateChanged(auth, (user) => {
            if (user) handleUserLogin(user);
            else handleUserLogout();
        });

        // --- 6. FUNCTIONS & FIRESTORE LOGIC ---

        // A function to call our 'getUserNotes' Cloud Function
        async function fetchAndRenderNotes() {
            if (!currentUser) return;
            
            const getUserNotes = httpsCallable(functions, 'getUserNotes');

            try {
                const result = await getUserNotes();
                const notes = result.data.notes;
                
                notesContainer.innerHTML = '';
                notes.forEach(note => {
                    renderNote(note);
                });

            } catch (error) {
                console.error("Error calling getUserNotes function:", error);
                alert(`Error: ${error.message}`); // Corrected template literal syntax
            }
        }

        async function shareNote(noteId) {
            const collaboratorId = prompt("Enter the User ID of the person you want to share this note with:");
            if (!collaboratorId || collaboratorId.trim() === "") return;
            
            if (collaboratorId.trim() === currentUser.uid) {
                alert("You already have access to this note!");
                return;
            }

            try {
                const noteRef = doc(db, "notes", noteId);
                await updateDoc(noteRef, { collaborators: arrayUnion(collaboratorId.trim()) });
                alert("Note shared successfully!");
            } catch (e) {
                console.error("Error sharing note: ", e);
                alert("Failed to share note. See console for details.");
            }
        }

        async function deleteNote(noteId) {
            if (!currentUser || !noteId) return;
            // In a real app, you would use a custom modal for confirmation.
            // For now, we delete directly.
            await deleteDoc(doc(db, "notes", noteId));
            fetchAndRenderNotes(); // Re-fetch the notes list after deleting
        }

        function renderNote(note) { // The 'note' object now comes directly from our function call
            const noteElement = noteTemplate.content.cloneNode(true);
            const div = noteElement.firstElementChild;
            div.setAttribute('data-id', note.id);
            div.querySelector('.note-content').textContent = note.content;
            
            // Only show the share button if the current user is the owner
            const shareBtn = div.querySelector('.share-btn');
            if (note.owner === currentUser.uid) {
                shareBtn.onclick = () => shareNote(note.id);
            } else {
                shareBtn.style.display = 'none';
            }
            
            div.querySelector('.delete-btn').onclick = () => deleteNote(note.id);
            notesContainer.appendChild(noteElement);
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
                fetchAndRenderNotes(); // Re-fetch the notes list after adding
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