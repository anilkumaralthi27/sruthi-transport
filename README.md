# Sruthi Transport — Complete Setup Guide

## 📁 Files in this project

```
sruthi-transport/
├── index.html          ← Main app (all 3 pages + dashboard)
├── style.css           ← All styling, dark/light mode
├── app.js              ← All logic (CRUD, PDF, pagination)
├── firebase-config.js  ← ← ← YOU EDIT THIS FILE ONLY
└── README.md           ← This guide
```

---

## PART 1 — FIREBASE SETUP

### Step 1: Create a Google account
If you don't have one, go to https://accounts.google.com and create one.

### Step 2: Go to Firebase Console
Open: https://console.firebase.google.com

### Step 3: Create a new project
1. Click the big **"+ Add project"** button
2. Enter project name: **sruthi-transport**
3. Click **Continue**
4. On "Google Analytics" screen — click **"Disable"** (not needed)
5. Click **"Create project"**
6. Wait ~10 seconds → Click **"Continue"**

### Step 4: Create a Firestore Database
1. In the left sidebar, click **"Firestore Database"**
2. Click **"Create database"**
3. Select **"Start in test mode"** → Click **Next**
4. Choose location: **asia-south1 (Mumbai)** → Click **Enable**
5. Wait for it to finish setting up

### Step 5: Register your Web App
1. On the Firebase project home page, click the **"</>"** (Web) icon
2. Enter app nickname: **Sruthi Transport**
3. Do NOT check "Firebase Hosting"
4. Click **"Register app"**
5. You will see a code block like this:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "sruthi-transport.firebaseapp.com",
  projectId: "sruthi-transport",
  storageBucket: "sruthi-transport.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890"
};
```

6. **Copy all 6 values** (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId)

### Step 6: Paste into firebase-config.js
Open the file **firebase-config.js** in a text editor (Notepad, VS Code, etc.)

Replace each "PASTE_YOUR_..." with your actual value:

```javascript
const firebaseConfig = {
  apiKey:            "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain:        "sruthi-transport.firebaseapp.com",
  projectId:         "sruthi-transport",
  storageBucket:     "sruthi-transport.appspot.com",
  messagingSenderId: "123456789012",
  appId:             "1:123456789012:web:abcdef1234567890"
};
window.__ST_FIREBASE_CONFIG__ = firebaseConfig;
```

Save the file. Firebase is now configured! ✅

### Step 7: Test locally
Double-click **index.html** to open it in your browser.
You should see a green "Firebase Connected" status in the sidebar.
Try adding a credit entry — it will appear in Firestore instantly.

---

## PART 2 — GITHUB SETUP + FREE HOSTING

GitHub Pages hosts your app for FREE at a public URL.

### Step 1: Create a GitHub account
Go to https://github.com and sign up (free).

### Step 2: Create a new repository
1. After logging in, click the **"+"** icon (top right) → **"New repository"**
2. Repository name: **sruthi-transport**
3. Set visibility to **Public**
4. Do NOT check "Add a README file"
5. Click **"Create repository"**

### Step 3: Upload your files
On the new repository page:
1. Click **"uploading an existing file"** (or "Add file" → "Upload files")
2. Drag and drop ALL 4 files:
   - index.html
   - style.css
   - app.js
   - firebase-config.js
3. Scroll down, write a commit message: **"Initial upload"**
4. Click **"Commit changes"**

### Step 4: Enable GitHub Pages
1. In your repository, click **"Settings"** (top tab)
2. In the left sidebar, scroll down and click **"Pages"**
3. Under **"Source"**, click the dropdown and select **"Deploy from a branch"**
4. Under **"Branch"**, select **"main"** and folder **"/ (root)"**
5. Click **"Save"**
6. Wait 1–2 minutes

### Step 5: Get your live URL
1. Go back to **Settings → Pages**
2. You will see: **"Your site is live at https://YOUR-USERNAME.github.io/sruthi-transport/"**
3. Click that link — your app is live! 🎉

Share this URL with anyone — it works on mobile and desktop.

---

## PART 3 — UPDATING THE APP LATER

When you want to edit the app:

**Method A (Simple — GitHub website):**
1. Go to your repository on GitHub
2. Click the file you want to edit (e.g., firebase-config.js)
3. Click the pencil ✏️ icon
4. Make your changes
5. Click "Commit changes" → changes go live in ~1 minute

**Method B (Faster — replace files):**
1. Edit the file on your computer
2. Go to your GitHub repository
3. Click the file → click the pencil → select all text → paste new content → Commit

---

## PART 4 — FIRESTORE SECURITY (Important for production)

Right now Firestore is in "test mode" — anyone can read/write.
After testing, secure it:

1. Go to Firebase Console → Firestore → **Rules** tab
2. Replace the rules with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.time < timestamp.date(2026, 12, 31);
    }
  }
}
```

3. Click **"Publish"**

For full security, you would add Firebase Authentication (login system).

---

## PART 5 — HOW THE APP WORKS (No Firebase?)

If Firebase is NOT configured (you left the placeholder values),
the app automatically uses **browser localStorage**.

✅ Everything still works — add, edit, delete, PDF export
✅ Data is saved in the browser
⚠️ Data is only on that one browser/device
⚠️ Clearing browser data will delete records

To migrate to Firebase later, just fill in firebase-config.js and re-upload.

---

## Collections created in Firestore

| Collection | Used by |
|---|---|
| `credit` | Credit Amount page |
| `pending` | Pending Amount page |
| `loads` | Loads to Saburi page |

These are created automatically when you add the first record.

---

## Quick Troubleshooting

| Problem | Fix |
|---|---|
| "Firebase not configured" toast | Fill in firebase-config.js with real values |
| Data not saving | Check browser console (F12) for errors |
| GitHub Pages shows 404 | Wait 2 minutes, check Settings → Pages |
| PDF not downloading | Allow pop-ups/downloads in browser |
| App looks broken | Make sure all 4 files are uploaded to GitHub |

---

*Sruthi Transport Management System — Built with Firebase + GitHub Pages*
