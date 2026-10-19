"use strict";

// FLORENCE ART STUDIO — LOCAL LEARNING PROTOTYPE
// Everything in these arrays disappears on refresh. Do not use real student data.
// The PIN below is deliberately visible: it demonstrates the interface, NOT security.
const DEMO_PIN = "1234";
const SHEET_SIZE = 10;
const $ = (id) => document.getElementById(id);

let nextStudentId = 1;
let nextSheetId = 1;
let nextVisitId = 1;
let selectedStudentId = null;
let pendingConfirmation = null;
let pendingPinAction = null;
let toastTimer;
const logEntries = [];

// Dates use the browser's local calendar date (not UTC).
function todayISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function daysAgo(days) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - days);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function prettyDate(iso) {
  if (!iso) return "Never";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric"
  });
}
function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = String(text); // safe for user-entered names
  return el;
}
function makeVisit(date, source = "confirmed") {
  return { id: nextVisitId++, date, source };
}
function makeSheet(visits = []) {
  return { id: nextSheetId++, visits };
}
function makeStudent(name, age, currentOffsets, previousOffsets = []) {
  const sheets = [];
  if (previousOffsets.length) {
    sheets.push(makeSheet(previousOffsets.map((n) => makeVisit(daysAgo(n), "sample"))));
  }
  sheets.push(makeSheet(currentOffsets.map((n) => makeVisit(daysAgo(n), "sample"))));
  return { id: nextStudentId++, name, age, sheets };
}

// Fictional examples, including two students with the same name.
const students = [
  makeStudent("Emily Chen", 12, [42, 35, 28, 21, 14, 7], [175, 168, 161, 154, 147, 140, 133, 126, 119, 112]),
  makeStudent("Kevin Li", 16, [63, 56, 49, 42, 35, 28, 21, 14, 7]),
  makeStudent("Sophia Wang", 10, [70, 63, 56, 49, 42, 35, 28, 21, 14, 7]),
  makeStudent("Jason Wu", 15, [21, 14, 7]),
  makeStudent("Emily Chen", 17, [28, 14]),
  makeStudent("Lucy Zhang", 9, [])
];

function currentSheet(student) {
  return student.sheets[student.sheets.length - 1];
}
function allVisits(student) {
  return student.sheets.flatMap((sheet) => sheet.visits);
}
function lastVisit(student) {
  const dates = allVisits(student).map((visit) => visit.date).sort();
  return dates.length ? dates[dates.length - 1] : null;
}
function hasVisitOn(student, date) {
  return allVisits(student).some((visit) => visit.date === date);
}
function selectedStudent() {
  return students.find((student) => student.id === selectedStudentId);
}
function addLog(description) {
  logEntries.unshift({ description, when: new Date() });
  renderLog();
}
function toast(message) {
  const box = $("toast");
  box.textContent = message;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, 4200);
}

// Switch between the Home, Student Sheet, Success, and Admin screens.
function showScreen(name) {
  for (const key of ["home", "student", "success", "admin"]) {
    $(`${key}-screen`).hidden = key !== name;
  }
  // When already inside admin tools, hide the redundant entry button.
  $("admin-entry").hidden = name === "admin";
  window.scrollTo(0, 0);
}
function goHome() {
  $("student-search").value = "";
  renderSearch();
  showScreen("home");
}

// The home page only displays matches after someone begins typing.
function renderSearch() {
  const query = $("student-search").value.trim().toLocaleLowerCase();
  $("clear-search").hidden = query.length === 0;
  const results = $("search-results");
  results.replaceChildren();
  if (!query) {
    $("search-status").textContent = "Start typing to find a student.";
    return;
  }
  const matches = students
    .filter((student) => student.name.toLocaleLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name));
  $("search-status").textContent = `${matches.length} matching student${matches.length === 1 ? "" : "s"}`;
  if (matches.length === 0) {
    results.appendChild(element("p", "empty-state", "No matching students. Check the spelling or ask the teacher."));
    return;
  }
  for (const student of matches) {
    const row = element("button", "search-result");
    row.type = "button";
    const left = element("span");
    left.appendChild(element("span", "result-name", student.name));
    const age = student.age === null ? "Age not listed" : `Age ${student.age}`;
    left.appendChild(element("span", "result-subtitle", `${age} · Last visit: ${prettyDate(lastVisit(student))}`));
    const used = currentSheet(student).visits.length;
    row.append(left, element("span", "result-right", `${used} / 10 used  →`));
    row.addEventListener("click", () => openStudent(student.id));
    results.appendChild(row);
  }
}
function openStudent(id) {
  selectedStudentId = id;
  renderStudent();
  showScreen("student");
}

// Each table always has ten rows. Their order implicitly tracks visit count.
function renderStudent() {
  const student = selectedStudent();
  if (!student) return;
  const sheet = currentSheet(student);
  const used = sheet.visits.length;
  $("student-heading").textContent = student.name;
  $("student-meta").textContent = student.age === null ? "Age not listed" : `Age ${student.age}`;
  $("visit-count").textContent = `${used} / ${SHEET_SIZE} visits`;
  $("remaining-count").textContent = `${SHEET_SIZE - used} visits remaining`;
  const tbody = $("attendance-rows");
  tbody.replaceChildren();
  for (let i = 0; i < SHEET_SIZE; i++) {
    const visit = sheet.visits[i];
    const row = element("tr");
    row.setAttribute("aria-label", `Attendance row ${i + 1}`);
    const dateCell = element("td", visit ? "" : "blank-cell", visit ? prettyDate(visit.date) : "—");
    const ackCell = element("td");
    if (visit) {
      const mark = element("span", "recorded-dot", "✓");
      mark.setAttribute("aria-hidden", "true");
      ackCell.append(mark, element("span", "recorded", visit.source === "imported" ? "From paper" : "Recorded"));
    } else {
      ackCell.className = "blank-cell";
      ackCell.textContent = "—";
    }
    row.append(dateCell, ackCell);
    tbody.appendChild(row);
  }
  const full = used === SHEET_SIZE;
  const alreadyToday = hasVisitOn(student, todayISO());
  $("record-visit").hidden = full;
  $("record-visit").disabled = alreadyToday;
  $("sheet-alert").hidden = !full && !alreadyToday;
  $("sheet-alert").textContent = full
    ? "This sheet is complete. Ask the teacher to confirm payment before starting a new one."
    : alreadyToday ? "Today's visit has already been recorded for this student." : "";
  $("renew-from-sheet").hidden = !full;

  const archives = student.sheets.slice(0, -1).reverse();
  $("previous-sheets").hidden = archives.length === 0;
  $("history-summary").textContent = `Previous attendance sheets (${archives.length})`;
  const history = $("sheet-history");
  history.replaceChildren();
  for (const [index, old] of archives.entries()) {
    const wrap = element("div", "archive-item");
    wrap.appendChild(element("strong", "", `Previous sheet ${archives.length - index} · ${old.visits.length}/10 recorded`));
    wrap.appendChild(element("div", "archive-dates", old.visits.map((v) => prettyDate(v.date)).join(" · ")));
    history.appendChild(wrap);
  }
}

function recordVisit(student, date, source) {
  const sheet = currentSheet(student);
  if (sheet.visits.length >= SHEET_SIZE) return { ok: false, message: "This sheet is already complete." };
  if (hasVisitOn(student, date)) return { ok: false, message: "That date has already been recorded for this student." };
  sheet.visits.push(makeVisit(date, source));
  sheet.visits.sort((a, b) => a.date.localeCompare(b.date));
  addLog(`${student.name}: ${source === "imported" ? "Paper visit imported" : "Visit recorded"} (${prettyDate(date)})`);
  return { ok: true };
}

// A single reusable confirmation dialog for important actions.
function askConfirmation(title, message, buttonText, onAccept) {
  $("confirm-title").textContent = title;
  $("confirm-message").textContent = message;
  $("confirm-accept").textContent = buttonText;
  pendingConfirmation = onAccept;
  $("confirm-dialog").showModal();
}
function requestDemoPin(onSuccess) {
  pendingPinAction = onSuccess;
  $("pin-input").value = "";
  $("pin-error").hidden = true;
  $("pin-dialog").showModal();
  $("pin-input").focus();
}
function startVisitFlow() {
  const student = selectedStudent();
  if (!student) return;
  if (hasVisitOn(student, todayISO())) { toast("Already recorded for today."); return; }
  if (currentSheet(student).visits.length === SHEET_SIZE) { toast("The sheet is full."); return; }
  askConfirmation("Confirm today's visit", `Record a visit for ${student.name} on ${prettyDate(todayISO())}?`,
    "Record visit", () => {
      const result = recordVisit(student, todayISO(), "confirmed");
      if (!result.ok) { toast(result.message); renderStudent(); return; }
      const used = currentSheet(student).visits.length;
      $("success-message").textContent = `${student.name}: ${used} of 10 visits recorded. ${10 - used} remaining.`;
      $("success-complete").hidden = used !== SHEET_SIZE;
      $("renew-from-success").hidden = used !== SHEET_SIZE;
      showScreen("success");
    }
  );
}
function startNewSheetFlow() {
  const student = selectedStudent();
  if (!student || currentSheet(student).visits.length !== SHEET_SIZE) return;
  requestDemoPin(() => askConfirmation(
    "Start a new sheet?",
    `Only proceed if the teacher has received payment for ${student.name}'s next 10 classes. The completed sheet will remain in history. No payment is processed here.`,
    "Confirm and start", () => {
      if (currentSheet(student).visits.length !== SHEET_SIZE) return;
      student.sheets.push(makeSheet());
      addLog(`${student.name}: New 10-visit sheet created (payment marked received in demo)`);
      renderStudent();
      showScreen("student");
      toast("New empty sheet created. Previous sheet saved in history.");
    }
  ));
}

// Admin tabs keep the teacher dashboard compact on a phone.
function selectAdminTab(name) {
  for (const key of ["students", "attendance", "log"]) {
    const isActive = key === name;
    $(`admin-${key}`).hidden = !isActive;
    const tab = document.querySelector(`[data-tab="${key}"]`);
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  }
  if (name === "students") renderEditCorrections();
  if (name === "attendance") renderAdminAttendance();
  if (name === "log") renderLog();
}
function populateSelect(select, desiredId) {
  select.replaceChildren();
  const ordered = [...students].sort((a, b) => a.name.localeCompare(b.name));
  for (const student of ordered) {
    const age = student.age === null ? "age not listed" : `age ${student.age}`;
    const option = element("option", "", `${student.name} (${age})`);
    option.value = String(student.id);
    select.appendChild(option);
  }
  if (ordered.some((student) => String(student.id) === String(desiredId))) select.value = String(desiredId);
}
function refreshAdminSelectors(preferredId) {
  const oldEdit = preferredId || $("edit-select").value;
  const oldAttendance = preferredId || $("attendance-select").value;
  populateSelect($("edit-select"), oldEdit);
  populateSelect($("attendance-select"), oldAttendance);
  fillEditForm();
  renderAdminAttendance();
  renderEditCorrections();
}
function fillEditForm() {
  const student = students.find((s) => s.id === Number($("edit-select").value));
  $("edit-name").value = student ? student.name : "";
  $("edit-age").value = student && student.age !== null ? student.age : "";
  renderEditCorrections();
}
function parseAge(field) {
  if (field.value.trim() === "") return null;
  const age = Number(field.value);
  return Number.isInteger(age) && age >= 1 && age <= 120 ? age : null;
}
function renderAdminAttendance() {
  const student = students.find((s) => s.id === Number($("attendance-select").value));
  const oldList = $("admin-archive-list");
  oldList.replaceChildren();
  if (!student) { $("admin-attendance-summary").textContent = "Select a student."; return; }
  const sheet = currentSheet(student);
  $("admin-attendance-summary").textContent = `${student.name}: ${sheet.visits.length} of 10 visits in the current sheet.`;
  $("import-button").disabled = sheet.visits.length >= SHEET_SIZE;
  const oldSheets = student.sheets.slice(0, -1).reverse();
  $("admin-archive-panel").hidden = oldSheets.length === 0;
  for (const old of oldSheets) {
    const block = element("div", "archive-item");
    block.appendChild(element("strong", "", `Completed sheet · ${old.visits.length} recorded`));
    block.appendChild(element("div", "archive-dates", old.visits.map((v) => prettyDate(v.date)).join(" · ")));
    oldList.appendChild(block);
  }
}
function renderEditCorrections() {
  const student = students.find((s) => s.id === Number($("edit-select").value));
  const visitList = $("admin-visit-list");
  visitList.replaceChildren();
  if (!student) return;
  const sheet = currentSheet(student);
  if (sheet.visits.length === 0) {
    visitList.appendChild(element("p", "empty-state", "No visits on this sheet yet."));
  }
  for (const visit of [...sheet.visits].sort((a, b) => b.date.localeCompare(a.date))) {
    const row = element("div", "admin-visit-row");
    const info = element("div");
    info.appendChild(element("strong", "", prettyDate(visit.date)));
    info.appendChild(element("p", "small-note", visit.source === "imported" ? "Imported from paper" : "Recorded visit"));
    const remove = element("button", "remove-button", "Correct / remove");
    remove.type = "button";
    remove.addEventListener("click", () => askConfirmation(
      "Correct attendance entry?",
      `Remove the visit dated ${prettyDate(visit.date)} from ${student.name}'s current sheet? This change will be added to the activity log.`,
      "Remove entry", () => {
        sheet.visits = sheet.visits.filter((entry) => entry.id !== visit.id);
        addLog(`${student.name}: Attendance corrected — removed ${prettyDate(visit.date)}`);
        renderEditCorrections();
        renderAdminAttendance();
        toast("Attendance correction recorded.");
      }
    ));
    row.append(info, remove);
    visitList.appendChild(row);
  }
}
function renderLog() {
  const list = $("activity-log");
  list.replaceChildren();
  if (logEntries.length === 0) {
    list.appendChild(element("p", "empty-state", "No actions recorded yet. Record or import a visit to begin the log."));
  }
  for (const entry of logEntries) {
    const row = element("div", "log-row");
    row.appendChild(element("strong", "", entry.description));
    row.appendChild(element("p", "small-note", entry.when.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })));
    list.appendChild(row);
  }
}

// Connect the HTML buttons and forms to the functions above.
$("brand-home").addEventListener("click", goHome);
$("student-back").addEventListener("click", goHome);
$("success-home").addEventListener("click", goHome);
$("admin-back").addEventListener("click", goHome);
$("student-search").addEventListener("input", renderSearch);
$("clear-search").addEventListener("click", () => {
  $("student-search").value = "";
  renderSearch();
  $("student-search").focus();
});
$("record-visit").addEventListener("click", startVisitFlow);
$("renew-from-sheet").addEventListener("click", startNewSheetFlow);
$("renew-from-success").addEventListener("click", startNewSheetFlow);
$("admin-entry").addEventListener("click", () => requestDemoPin(() => {
  refreshAdminSelectors();
  selectAdminTab("students");
  showScreen("admin");
}));

$("confirm-cancel").addEventListener("click", () => $("confirm-dialog").close());
$("confirm-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const action = pendingConfirmation;
  pendingConfirmation = null;
  $("confirm-dialog").close();
  if (action) action();
});
$("pin-cancel").addEventListener("click", () => $("pin-dialog").close());
$("pin-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if ($("pin-input").value !== DEMO_PIN) {
    $("pin-error").hidden = false;
    $("pin-input").select();
    return;
  }
  const action = pendingPinAction;
  pendingPinAction = null;
  $("pin-dialog").close();
  if (action) action();
});
$("pin-dialog").addEventListener("close", () => { pendingPinAction = null; });
$("confirm-dialog").addEventListener("close", () => { pendingConfirmation = null; });
for (const tab of document.querySelectorAll("[data-tab]")) {
  tab.addEventListener("click", () => selectAdminTab(tab.dataset.tab));
}
$("add-student-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("new-name").value.trim();
  if (!name) return;
  const student = makeStudent(name, parseAge($("new-age")), []);
  students.push(student);
  addLog(`${student.name}: Student record added`);
  $("add-student-form").reset();
  refreshAdminSelectors(student.id);
  toast("Student added with an empty sheet.");
});
$("edit-select").addEventListener("change", fillEditForm);
$("edit-student-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const student = students.find((s) => s.id === Number($("edit-select").value));
  if (!student) return;
  const name = $("edit-name").value.trim();
  if (!name) return;
  const oldName = student.name;
  student.name = name;
  student.age = parseAge($("edit-age"));
  addLog(`${oldName}: Student details updated${name !== oldName ? ` (now ${name})` : ""}`);
  refreshAdminSelectors(student.id);
  toast("Student details saved.");
});
$("attendance-select").addEventListener("change", renderAdminAttendance);
$("import-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const student = students.find((s) => s.id === Number($("attendance-select").value));
  const date = $("import-date").value;
  if (!student || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  if (date > todayISO()) { toast("You cannot import a future date."); return; }
  askConfirmation("Import paper attendance?", `Add ${prettyDate(date)} to ${student.name}'s current sheet?`,
    "Import visit", () => {
      const result = recordVisit(student, date, "imported");
      if (!result.ok) { toast(result.message); return; }
      $("import-form").reset();
      renderAdminAttendance();
      renderEditCorrections();
      toast("Paper visit imported.");
    }
  );
});

$("import-date").max = todayISO();
renderSearch();
refreshAdminSelectors();
renderLog();
