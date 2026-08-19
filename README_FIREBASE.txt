SMART ATTENDANCE - FIREBASE VERSION
===================================

This version replaces the old localStorage user/attendance database with
Firebase Authentication + Cloud Firestore. It is designed for GitHub Pages.

1) CREATE FIREBASE PROJECT
--------------------------
- Open Firebase Console: https://console.firebase.google.com/
- Create a project.
- Add a Web App (</>).
- Copy the Firebase Web App configuration.

2) ENABLE LOGIN
---------------
Firebase Console -> Authentication -> Sign-in method
- Enable Email/Password.

3) CREATE FIRESTORE
-------------------
Firebase Console -> Firestore Database -> Create database.
- Start in production mode if you want.
- Open Rules and paste the contents of firestore.rules.
- Publish the rules.

4) ADD YOUR FIREBASE CONFIG
---------------------------
Open firebase-config.js and replace ALL placeholder values:
YOUR_API_KEY
YOUR_PROJECT_ID
YOUR_MESSAGING_SENDER_ID
YOUR_APP_ID
with the values from Firebase Project settings -> Your apps -> Web app.

5) GITHUB PAGES
---------------
Upload all files in this folder to your GitHub repository.
Enable GitHub Pages from Settings -> Pages.
Open the HTTPS GitHub Pages URL.

IMPORTANT
---------
- Do NOT open the HTML files by double-clicking them.
- Use the GitHub Pages HTTPS URL so camera, location and Firebase work correctly.
- Every phone now uses the SAME Firestore database.
- Each new account gets a unique SAxxxxxx User ID.
- Management page reads all registered users from Firestore.
- A logged-in user sees only their own attendance history.
- Management can click any User ID to view that user's history.

DATA STRUCTURE
--------------
Firestore collection: users
  document ID = Firebase Authentication UID

Firestore collection: attendance
  each document contains userId, ownerUid, date, time, status and verification fields.

SECURITY
--------
The included Firestore rules require authentication. Signed-in users can read
user/attendance data because the existing Management page is intended to show
all registered accounts. If you later want a separate manager-only account,
add an admin role and tighten the rules.
