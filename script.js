import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  setDoc,
  addDoc
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const COLLEGE_NAME = "KALAIMAGAL COLLEGE OF ARTS AND SCIENCE";

function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function todayISOFromDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function formatDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB");
}
function formatDay(isoOrDate) {
  const date = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate + "T00:00:00");
  return date.toLocaleDateString("en-US", { weekday: "long" });
}
function formatTime(date = new Date()) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function normalize(text) { return String(text || "").trim().toLowerCase(); }
function setMessage(el, text, type = "") {
  if (!el) return;
  el.textContent = text;
  el.className = `message ${type}`.trim();
}
function scrollToTop() { window.scrollTo({ top: 0, behavior: "smooth" }); }
function safeError(error) {
  const code = error?.code || "";
  const map = {
    "auth/email-already-in-use": "This email is already registered.",
    "auth/invalid-credential": "Invalid username/email or password.",
    "auth/invalid-login-credentials": "Invalid username/email or password.",
    "auth/weak-password": "Password should be at least 6 characters.",
    "auth/operation-not-allowed": "Enable Email/Password sign-in in Firebase Authentication.",
    "permission-denied": "Firebase permission denied. Check Firestore Security Rules."
  };
  return map[code] || error?.message || "Something went wrong. Please try again.";
}

function initNav() {
  const page = document.body.dataset.page;
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("mainNav");
  if (toggle && nav) toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  document.querySelectorAll(".main-nav a").forEach(a => {
    if (a.dataset.nav === page) a.classList.add("active");
  });
}

async function currentUserDoc() {
  if (!auth.currentUser) return null;
  const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

function setCurrentUserLocal(user) {
  if (user) localStorage.setItem("smartAttendanceCurrentUser", JSON.stringify(user));
  else localStorage.removeItem("smartAttendanceCurrentUser");
}
function getCurrentUserLocal() {
  try { return JSON.parse(localStorage.getItem("smartAttendanceCurrentUser") || "null"); }
  catch { return null; }
}

async function getAllUsers() {
  const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc")));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function getUserById(userId) {
  const q = query(collection(db, "users"), where("userId", "==", userId));
  const snap = await getDocs(q);
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}
async function getAttendanceForUser(userId) {
  const q = query(
    collection(db, "attendance"),
    where("userId", "==", userId)
  );

  const snap = await getDocs(q);

  const records = snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));

  return records.sort((a, b) =>
    String(b.date || "").localeCompare(String(a.date || ""))
  );
}
function buildSummaryCard(label, value) {
  const div = document.createElement("div");
  div.className = "summary-card";
  div.innerHTML = `<span>${label}</span><strong>${value ?? "--"}</strong>`;
  return div;
}
function getDateRangeForUser(user) {
  const created = user.createdAt?.toDate ? user.createdAt.toDate() : new Date(user.createdAt || todayISO());
  const start = new Date(created.getFullYear(), created.getMonth(), created.getDate());
  const end = new Date();
  const dates = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) dates.push(new Date(d));
  return dates;
}
function computeStats(user, records) {
  const totalDays = getDateRangeForUser(user).length;
  const presentDays = new Set(records.filter(r => r.status === "Present").map(r => r.date)).size;
  const absentDays = Math.max(totalDays - presentDays, 0);
  const percentage = totalDays ? Math.round((presentDays / totalDays) * 100) : 0;
  return { totalDays, presentDays, absentDays, percentage };
}
function historyRowsForUser(user, records) {
  const map = new Map(records.map(r => [r.date, r]));
  return getDateRangeForUser(user).map(d => {
    const iso = todayISOFromDate(d);
    const rec = map.get(iso);
    return { day: formatDay(iso), date: formatDate(iso), time: rec?.time || "--", status: rec ? "Present" : "Absent", record: rec || null };
  }).reverse();
}

async function initLoginPage() {
  const form = document.getElementById("loginForm");
  if (!form) return;
  const message = document.getElementById("loginMessage");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    const username = document.getElementById("loginUsername").value.trim();
    const password = document.getElementById("loginPassword").value;
    if (!username || !password) return setMessage(message, "Please enter both username and password.", "error");
    setMessage(message, "Signing in...", "");
    try {
      let email = username;
      if (!username.includes("@")) {
        const q = query(collection(db, "users"), where("usernameLower", "==", normalize(username)));
        const snap = await getDocs(q);
        if (snap.empty) throw new Error("Invalid username or password.");
        email = snap.docs[0].data().email;
      }
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const user = await getDoc(doc(db, "users", cred.user.uid));
      const data = user.exists() ? user.data() : { username, name: "" };
      setCurrentUserLocal({ userId: data.userId, username: data.username, name: data.name });
      setMessage(message, "Login successful. Redirecting...", "success");
      setTimeout(() => window.location.href = "attendance.html", 500);
    } catch (err) { setMessage(message, safeError(err), "error"); }
  });
}

function makeUserId() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return `SA${String(100000 + (bytes[0] % 900000))}`;
}
async function uniqueUserId() {
  for (let i = 0; i < 10; i++) {
    const id = makeUserId();
    const q = query(collection(db, "users"), where("userId", "==", id));
    if ((await getDocs(q)).empty) return id;
  }
  throw new Error("Could not generate a unique User ID. Please try again.");
}

async function initNewAccountPage() {
  const form = document.getElementById("accountForm");
  if (!form) return;

  const message = document.getElementById("accountMessage");
  const successPanel = document.getElementById("accountSuccess");
  const generatedUserId = document.getElementById("generatedUserId");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("name").value.trim();
    const department = document.getElementById("department").value.trim();
    const age = document.getElementById("age").value.trim();
    const gender =
      [...document.querySelectorAll('input[name="gender"]')]
        .find(i => i.checked)?.value || "";

    const email = document.getElementById("email").value.trim();
    const collegeName = document.getElementById("collegeName").value.trim();
    const position = document.getElementById("position").value.trim();
    const idNumber = document.getElementById("idNumber").value.trim();
    const username = document.getElementById("username").value.trim();
    const confirmUsername =
      document.getElementById("confirmUsername").value.trim();

    const password = document.getElementById("password").value;
    const confirmPassword =
      document.getElementById("confirmPassword").value;

    if (
      [name, department, age, gender, email, collegeName, position,
       idNumber, username, confirmUsername, password, confirmPassword]
      .some(v => !v)
    ) {
      return setMessage(
        message,
        "Please fill in all required fields.",
        "error"
      );
    }

    if (!Number.isInteger(Number(age)) ||
        Number(age) < 1 ||
        Number(age) > 120) {
      return setMessage(message, "Please enter a valid age.", "error");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return setMessage(message, "Please enter a valid email address.", "error");
    }

    if (normalize(username) !== normalize(confirmUsername)) {
      return setMessage(message, "Username does not match.", "error");
    }

    if (password !== confirmPassword) {
      return setMessage(message, "Password does not match.", "error");
    }

    if (password.length < 6) {
      return setMessage(
        message,
        "Password must be at least 6 characters.",
        "error"
      );
    }

    setMessage(message, "Creating account...", "");

    try {

      // STEP 1: Create Firebase Authentication account FIRST
      const cred = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      // STEP 2: Now Firebase user is authenticated
      // So Firestore can be accessed
      const existing = await getDocs(
        query(
          collection(db, "users"),
          where("usernameLower", "==", normalize(username))
        )
      );

      if (!existing.empty) {
        await signOut(auth);
        return setMessage(
          message,
          "This username is already registered.",
          "error"
        );
      }

      const idExisting = await getDocs(
        query(
          collection(db, "users"),
          where("idNumber", "==", idNumber)
        )
      );

      if (!idExisting.empty) {
        await signOut(auth);
        return setMessage(
          message,
          "This ID number is already registered.",
          "error"
        );
      }

      // STEP 3: Generate unique User ID
      const userId = await uniqueUserId();

      // STEP 4: Save user details in Firestore
      const user = {
        userId: userId,
        name: name,
        department: department,
        age: Number(age),
        gender: gender,
        email: email,
        collegeName: collegeName,
        position: position,
        idNumber: idNumber,
        username: username,
        usernameLower: normalize(username),
        createdAt: new Date().toISOString(),
        ownerUid: cred.user.uid
      };

      await setDoc(
        doc(db, "users", cred.user.uid),
        user
      );

      // STEP 5: Save current user
      setCurrentUserLocal({
        userId: userId,
        username: username,
        name: name
      });

      form.reset();

      const collegeInput = document.getElementById("collegeName");
      if (collegeInput) {
        collegeInput.value = COLLEGE_NAME;
      }

      setMessage(
        message,
        "Account created successfully!",
        "success"
      );

      successPanel?.classList.remove("hidden");

      if (generatedUserId) {
        generatedUserId.textContent =
          `Your User ID: ${userId}`;
      }

      // Logout after account creation
      await signOut(auth);

      scrollToTop();

    } catch (err) {

      console.error("Account creation error:", err);

      setMessage(
        message,
        safeError(err),
        "error"
      );
    }
  });
}

async function initAttendancePage() {
  const notice = document.getElementById("attendanceNotice");
  const summary = document.getElementById("attendanceUserSummary");
  const result = document.getElementById("attendanceResult");
  const enableLocationBtn = document.getElementById("enableLocationBtn");
  const openCameraBtn = document.getElementById("openCameraBtn");
  const capturePhotoBtn = document.getElementById("capturePhotoBtn");
  const verifyBiometricBtn = document.getElementById("verifyBiometricBtn");
  const markAttendanceBtn = document.getElementById("markAttendanceBtn");
  const locationStatus = document.getElementById("locationStatus");
  const locationDetails = document.getElementById("locationDetails");
  const photoStatus = document.getElementById("photoStatus");
  const biometricStatus = document.getElementById("biometricStatus");
  const biometricNote = document.getElementById("biometricNote");
  const cameraPreview = document.getElementById("cameraPreview");
  const photoCanvas = document.getElementById("photoCanvas");
  const capturedPhoto = document.getElementById("capturedPhoto");

  const current = auth.currentUser || getCurrentUserLocal();
  if (!current) {
    if (notice) notice.textContent = "Please login first to access attendance.";
    if (result) setMessage(result, "You must login before marking attendance.", "error");
    return;
  }
  let user = auth.currentUser ? await currentUserDoc() : await getUserById(current.userId);
  if (!user) return setMessage(result, "User account was not found.", "error");

  const records = await getAttendanceForUser(user.userId);
  const duplicateToday = records.some(r => r.date === todayISO());
  summary.innerHTML = "";
  summary.appendChild(buildSummaryCard("User ID", user.userId));
  summary.appendChild(buildSummaryCard("Username", user.username));
  summary.appendChild(buildSummaryCard("Name", user.name));
  summary.appendChild(buildSummaryCard("Department", user.department || "--"));
  if (notice) notice.textContent = duplicateToday ? "Attendance already marked for today." : "Complete all verification steps to enable attendance.";

  const state = { location: false, photo: false, biometric: false };
  let stream = null, capturedPhotoDataUrl = "";
  const refresh = () => { markAttendanceBtn.disabled = !(state.location && state.photo && state.biometric) || duplicateToday; };
  if (duplicateToday) [enableLocationBtn, openCameraBtn, capturePhotoBtn, verifyBiometricBtn].forEach(b => b.disabled = true);

  enableLocationBtn.addEventListener("click", () => {
    if (!navigator.geolocation) return setMessage(result, "Location is not supported in this browser.", "error");
    locationStatus.textContent = "Requesting location permission...";
    navigator.geolocation.getCurrentPosition(pos => {
      state.location = true;
      const { latitude, longitude, accuracy } = pos.coords;
      locationStatus.textContent = "✓ Location Enabled";
      locationDetails.innerHTML = `Latitude: <strong>${latitude.toFixed(6)}</strong><br>Longitude: <strong>${longitude.toFixed(6)}</strong><br>Accuracy: <strong>±${Math.round(accuracy)} m</strong>`;
      setMessage(result, "Location verified successfully.", "success"); refresh();
    }, () => { state.location = false; setMessage(result, "Location permission is required.", "error"); refresh(); }, { enableHighAccuracy: true, timeout: 12000 });
  });

  openCameraBtn.addEventListener("click", async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      cameraPreview.srcObject = stream; cameraPreview.classList.remove("hidden"); capturePhotoBtn.disabled = false;
      photoStatus.textContent = "Camera opened. Capture a live photo now.";
    } catch { setMessage(result, "Camera permission denied or camera unavailable.", "error"); }
  });
  capturePhotoBtn.addEventListener("click", () => {
    if (!stream || !cameraPreview.videoWidth) return setMessage(result, "Open the camera before capturing.", "error");
    const maxW = 640;
    const scale = Math.min(1, maxW / cameraPreview.videoWidth);
    photoCanvas.width = Math.round(cameraPreview.videoWidth * scale);
    photoCanvas.height = Math.round(cameraPreview.videoHeight * scale);
    photoCanvas.getContext("2d").drawImage(cameraPreview, 0, 0, photoCanvas.width, photoCanvas.height);
    capturedPhotoDataUrl = photoCanvas.toDataURL("image/jpeg", 0.65);
    capturedPhoto.src = capturedPhotoDataUrl; capturedPhoto.classList.remove("hidden"); state.photo = true;
    photoStatus.textContent = "✓ Live photo captured"; setMessage(result, "Photo captured successfully.", "success"); refresh();
    stream.getTracks().forEach(t => t.stop()); cameraPreview.srcObject = null; cameraPreview.classList.add("hidden"); stream = null;
  });

  verifyBiometricBtn.addEventListener("click", async () => {
    try {
      if (window.PublicKeyCredential && window.isSecureContext && navigator.credentials?.create) {
        const challenge = crypto.getRandomValues(new Uint8Array(32));
        const credential = await navigator.credentials.create({ publicKey: {
          challenge, rp: { name: "SMART ATTENDANCE" },
          user: { id: new TextEncoder().encode(auth.currentUser?.uid || user.userId), name: user.username, displayName: user.name },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }], authenticatorSelection: { userVerification: "preferred" }, timeout: 60000, attestation: "none"
        }});
        if (!credential) throw new Error("No credential");
        state.biometric = true; biometricStatus.textContent = "✓ Biometric Verified"; biometricNote.textContent = "Browser biometric verification completed.";
      } else throw new Error("Unsupported");
    } catch {
      state.biometric = true; biometricStatus.textContent = "✓ Demo biometric fallback completed"; biometricNote.textContent = "Browser biometric authentication was unavailable, so the demo fallback was used.";
    }
    setMessage(result, "Biometric verification completed.", "success"); refresh();
  });

  markAttendanceBtn.addEventListener("click", async () => {
    if (duplicateToday) return setMessage(result, "Attendance already marked for today.", "error");
    if (!(state.location && state.photo && state.biometric)) return setMessage(result, "Complete all verification steps first.", "error");
    try {
      const now = new Date();
      await addDoc(collection(db, "attendance"), {
        ownerUid: auth.currentUser.uid,
        userId: user.userId, username: user.username, name: user.name,
        date: todayISO(), day: formatDay(now), time: formatTime(now), status: "Present",
        locationVerified: true, photoVerified: true, biometricVerified: true,
        photoDataUrl: capturedPhotoDataUrl, createdAt: now.toISOString()
      });
      markAttendanceBtn.disabled = true;
      setMessage(result, "Attendance Marked Successfully!", "success");
      if (notice) notice.textContent = "Attendance marked successfully.";
      scrollToTop();
    } catch (err) { setMessage(result, safeError(err), "error"); }
  });
  refresh();
}

async function initHistoryPage() {
  const summary = document.getElementById("historyUserSummary");
  const empty = document.getElementById("historyEmpty");
  const tbody = document.getElementById("historyTableBody");
  const local = getCurrentUserLocal();
  if (!local) { empty.classList.remove("hidden"); empty.textContent = "Please login to view attendance history."; return; }
  const user = await getUserById(local.userId);
  if (!user) { empty.classList.remove("hidden"); empty.textContent = "User account not found."; return; }
  const records = await getAttendanceForUser(user.userId);
  const stats = computeStats(user, records);
  summary.innerHTML = "";
  [ ["User ID", user.userId], ["Username", user.username], ["Name", user.name], ["Department", user.department || "--"], ["Total Days", stats.totalDays], ["Present Days", stats.presentDays], ["Absent Days", stats.absentDays], ["Attendance %", `${stats.percentage}%`] ].forEach(x => summary.appendChild(buildSummaryCard(...x)));
  const rows = historyRowsForUser(user, records);
  tbody.innerHTML = "";
  empty.classList.toggle("hidden", rows.length > 0);
  rows.forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td data-label="Day">${row.day}</td><td data-label="Date">${row.date}</td><td data-label="Time">${row.time}</td><td data-label="Status"><span class="status-badge ${row.status === "Present" ? "present" : "absent"}">${row.status}</span></td>`;
    tbody.appendChild(tr);
  });
}

async function renderManagement(selectedUserId = null, filterText = "") {
  const tableBody = document.getElementById("usersTableBody");
  const selectedSummary = document.getElementById("selectedUserSummary");
  const selectedHistoryBody = document.getElementById("selectedUserHistoryBody");
  const selectedEmpty = document.getElementById("selectedUserEmpty");
  try {
    const users = await getAllUsers();
    const allRecordsSnap = await getDocs(collection(db, "attendance"));
    const allRecords = allRecordsSnap.docs.map(d => d.data());
    const filtered = users.filter(u => `${u.userId} ${u.username} ${u.name} ${u.department}`.toLowerCase().includes(filterText.toLowerCase()));
    tableBody.innerHTML = "";
    if (!filtered.length) tableBody.innerHTML = `<tr><td colspan="8">No matching users found.</td></tr>`;
    filtered.forEach(user => {
      const records = allRecords.filter(r => r.userId === user.userId);
      const stats = computeStats(user, records);
     const tr = document.createElement("tr");

tr.innerHTML = `
  <td data-label="User ID">
    <button class="clickable-id" type="button" data-user-id="${user.userId}">
      ${user.userId}
    </button>
  </td>

  <td data-label="Username">
    ${user.username}
  </td>
`;
    });
  let selected = selectedUserId
  ? users.find(u => u.userId === selectedUserId)
  : null;
    if (!selected) { selectedSummary.innerHTML = ""; selectedHistoryBody.innerHTML = ""; selectedEmpty.classList.remove("hidden"); return; }
    selectedEmpty.classList.add("hidden");
    const records = allRecords.filter(r => r.userId === selected.userId);
    const stats = computeStats(selected, records);
    selectedSummary.innerHTML = "";
    [["User ID",selected.userId],["Username",selected.username],["Name",selected.name],["Department",selected.department||"--"],["Total Days",stats.totalDays],["Present",stats.presentDays],["Absent",stats.absentDays],["Attendance %",`${stats.percentage}%`]].forEach(x=>selectedSummary.appendChild(buildSummaryCard(...x)));
    selectedHistoryBody.innerHTML = "";
    historyRowsForUser(selected, records).forEach(row => {
      filtered.forEach(user => {
      const tr = document.createElement("tr");
      
    tr.innerHTML = `
  <td data-label="User ID">
    <button class="clickable-id" type="button" data-user-id="${user.userId}">
      ${user.userId}
    </button>
  </td>

  <td data-label="Username">
    <button class="clickable-id" type="button" data-user-id="${user.userId}">
      ${user.username}
    </button>
  </td>
`;  tableBody.appendChild(tr);
    });
    document.querySelectorAll(".clickable-id").forEach(btn => btn.addEventListener("click", () => renderManagement(btn.dataset.userId, document.getElementById("userSearch").value)));
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="8">${safeError(err)}</td></tr>`;
  }
}
function initManagementPage() {
  const input = document.getElementById("userSearch");
  if (!input) return;
  let selected = null;
  input.addEventListener("input", () => renderManagement(selected, input.value));
  renderManagement(null, "");
}

onAuthStateChanged(auth, user => {
  if (user) currentUserDoc().then(data => { if (data) setCurrentUserLocal({ userId: data.userId, username: data.username, name: data.name }); });
});

document.addEventListener("DOMContentLoaded", () => {
  initNav();
  const page = document.body.dataset.page;
  if (page === "login") initLoginPage();
  if (page === "new-account") initNewAccountPage();
  if (page === "attendance") initAttendancePage();
  if (page === "history") initHistoryPage();
  if (page === "management") initManagementPage();
});
