"use strict";

// FLORENCE ART STUDIO — LOCAL LEARNING PROTOTYPE
// Everything in these arrays disappears on refresh. Do not use real student data.
// The PIN below is deliberately visible: it demonstrates the interface, NOT security.
const DEMO_PINS = ["1234", "5678"]; // Fictional demo only; NOT secure
const SHEET_SIZE = 10;
const $ = (id) => document.getElementById(id);

let nextStudentId = 1;
let nextSheetId = 1;
let nextVisitId = 1;
let selectedStudentId = null;
let pendingConfirmation = null;
let pendingCancelAction = null;
let pendingPinAction = null;
let editingVisitId = null;
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
function makeStudent(name, age, currentOffsets, previousOffsets = [], chineseName = "") {
  const sheets = [];
  if (previousOffsets.length) {
    sheets.push(makeSheet(previousOffsets.map((n) => makeVisit(daysAgo(n), "sample"))));
  }
  sheets.push(makeSheet(currentOffsets.map((n) => makeVisit(daysAgo(n), "sample"))));
  return { id: nextStudentId++, name, chineseName, age, sheets, paymentPending: false };
}

// Fictional examples, including two students with the same name.
const students = [
  makeStudent("Emily Chen", 12, [42, 35, 28, 21, 14, 7], [175, 168, 161, 154, 147, 140, 133, 126, 119, 112], "陈美玲"),
  makeStudent("Kevin Li", 16, [63, 56, 49, 42, 35, 28, 21, 14, 7], [], "李凯文"),
  makeStudent("Sophia Wang", 10, [63, 56, 49, 42, 35, 28, 21, 14, 7], [], "王思雅"),
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
  $("chinese-search").value = "";
  $("chinese-search-area").hidden = true;
  renderSearch();
  showScreen("home");
}

// English is the default search. Chinese search is an explicit fallback when no English name matches.
function appendStudentResults(results, matches) {
  results.replaceChildren();
  for (const student of matches) {
    const row = element("button", "search-result");
    row.type = "button";
    const left = element("span");
    left.appendChild(element("span", "result-name", student.name));
    const age = student.age === null ? "Age not listed" : `Age ${student.age}`;
    const sub = `${student.chineseName ? student.chineseName + " · " : ""}${age} · Last visit: ${prettyDate(lastVisit(student))}${student.paymentPending ? " · PAYMENT PENDING" : ""}`;
    left.appendChild(element("span", "result-subtitle", sub));
    const used = currentSheet(student).visits.length;
    row.append(left, element("span", "result-right", `${used} / 10 used  →`));
    row.addEventListener("click", () => openStudent(student.id));
    results.appendChild(row);
  }
}
function renderSearch() {
  const query = $("student-search").value.trim().toLocaleLowerCase();
  $("clear-search").hidden = query.length === 0;
  const results = $("search-results");
  results.replaceChildren();
  if (!query) {
    $("search-status").textContent = "Start typing to find a student.";
    $("chinese-search-toggle").hidden = true;
    $("chinese-search-area").hidden = true;
    return;
  }
  const matches = students.filter((student) => student.name.toLocaleLowerCase().includes(query))
    .sort((a,b) => a.name.localeCompare(b.name));
  $("search-status").textContent = `${matches.length} matching student${matches.length === 1 ? "" : "s"}`;
  const noMatches = matches.length === 0;
  $("chinese-search-toggle").hidden = !noMatches || !$("chinese-search-area").hidden;
  if (!noMatches) $("chinese-search-area").hidden = true;
  appendStudentResults(results, matches);
  if (noMatches) results.appendChild(element("p", "empty-state", "No English-name matches. Try Chinese-name search below."));
}
function renderChineseSearch() {
  const query = $("chinese-search").value.trim();
  const matches = query ? students.filter(s => (s.chineseName || "").includes(query)) : [];
  $("chinese-search-status").textContent = !query ? "Enter Chinese characters to search." : `${matches.length} matching student${matches.length === 1 ? "" : "s"}`;
  appendStudentResults($("chinese-search-results"), matches);
  if (query && !matches.length) $("chinese-search-results").appendChild(element("p", "empty-state", "No matching Chinese names."));
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
  $("student-meta").textContent = `${student.chineseName ? student.chineseName + " · " : ""}${student.age === null ? "Age not listed" : `Age ${student.age}`}`;
  $("visit-count").textContent = `${used} / ${SHEET_SIZE} visits`;
  $("remaining-count").textContent = `${SHEET_SIZE - used} visits remaining`;
  $("payment-hold").hidden = !student.paymentPending;
  $("resolve-payment").hidden = !student.paymentPending;
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
  pendingCancelAction = null;
  $("confirm-cancel").textContent = "Cancel";
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
  if (student.paymentPending) { toast("Payment already pending. Resolve the hold before creating another sheet."); return; }
  requestDemoPin(() => askConfirmation(
    "Start a new sheet?",
    `Start a new 0/10 sheet for ${student.name}. If cash has NOT been received, the student will be tagged PAYMENT PENDING. The completed sheet stays in history.`,
    "Continue", () => {
      if (currentSheet(student).visits.length !== SHEET_SIZE) return;
      // Ask for payment status only after authorizing a new sheet.
      askConfirmation("Has payment been received?", `Choose 'Payment received' only if cash has been collected from ${student.name}. Otherwise continue with a clearly marked unpaid sheet.`, "Payment received", () => finishNewSheet(student, false));
      // The secondary button becomes the unpaid option for this specific dialog.
      $("confirm-cancel").textContent = "Payment pending";
      pendingCancelAction = () => finishNewSheet(student, true);
    }
  ));
}

function finishNewSheet(student, unpaid) {
  if (currentSheet(student).visits.length !== SHEET_SIZE) return;
  student.sheets.push(makeSheet());
  student.paymentPending = unpaid;
  addLog(`${student.name}: New sheet started — ${unpaid ? "PAYMENT PENDING" : "payment received"}`);
  renderStudent();
  showScreen("student");
  toast(unpaid ? "New sheet opened with PAYMENT PENDING tag." : "New sheet opened. Payment marked received.");
}
function resolvePayment() {
  const student = selectedStudent();
  if (!student || !student.paymentPending) return;
  requestDemoPin(() => askConfirmation("Confirm cash received?", `Mark ${student.name}'s outstanding payment as received?`, "Mark paid", () => {
    student.paymentPending = false;
    addLog(`${student.name}: Payment hold cleared by administrator`);
    renderStudent();
    toast("Payment hold cleared.");
  }));
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
function renderAllStudents() {
  const container = $("all-students-list");
  container.replaceChildren();
  for (const student of [...students].sort((a,b) => a.name.localeCompare(b.name))) {
    const row = element("button", "search-result"); row.type = "button";
    const left = element("span");
    left.appendChild(element("span", "result-name", student.name));
    left.appendChild(element("span", "result-subtitle", `${student.chineseName ? student.chineseName + " · " : ""}${student.age === null ? "Age unknown" : `Age ${student.age}`} · Last visit ${prettyDate(lastVisit(student))}`));
    row.append(left, element("span", "result-right", `${currentSheet(student).visits.length}/10 · Edit →`));
    row.addEventListener("click", () => {
      $("edit-select").value = String(student.id);
      fillEditForm();
      $("edit-student-panel").scrollIntoView({behavior:"smooth",block:"start"});
    });
    container.appendChild(row);
  }
}
function refreshAdminSelectors(preferredId) {
  const oldEdit = preferredId || $("edit-select").value;
  const oldAttendance = preferredId || $("attendance-select").value;
  populateSelect($("edit-select"), oldEdit);
  populateSelect($("attendance-select"), oldAttendance);
  fillEditForm();
  renderAdminAttendance();
  renderEditCorrections();
  renderAllStudents();
}
function fillEditForm() {
  const student = students.find((s) => s.id === Number($("edit-select").value));
  $("edit-name").value = student ? student.name : "";
  $("edit-chinese-name").value = student ? student.chineseName || "" : "";
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
function beginEditVisit(visitId) {
  const student = students.find(s => s.id === Number($("edit-select").value));
  const visit = student && currentSheet(student).visits.find(v => v.id === visitId);
  if (!visit) return;
  editingVisitId = visitId;
  $("edit-visit-description").textContent = `Edit ${student.name}'s visit on ${prettyDate(visit.date)}.`;
  $("edit-visit-date").value = visit.date;
  $("edit-visit-date").max = todayISO();
  $("edit-visit-dialog").showModal();
}
function currentEditedVisit() {
  const student = students.find(s => s.id === Number($("edit-select").value));
  if (!student) return null;
  const visit = currentSheet(student).visits.find(v => v.id === editingVisitId);
  return visit ? {student, visit} : null;
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
    const edit = element("button", "button button-outline edit-visit-button", "Edit");
    edit.type = "button";
    edit.addEventListener("click", () => beginEditVisit(visit.id));
    row.append(info, edit);
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
$("chinese-search-toggle").addEventListener("click", () => {
  $("chinese-search-area").hidden = false;
  $("chinese-search-toggle").hidden = true;
  $("chinese-search").focus();
  renderChineseSearch();
});
$("chinese-search").addEventListener("input", renderChineseSearch);
$("clear-chinese-search").addEventListener("click", () => { $("chinese-search").value = ""; renderChineseSearch(); $("chinese-search").focus(); });
$("clear-search").addEventListener("click", () => {
  $("student-search").value = "";
  $("chinese-search").value = "";
  $("chinese-search-area").hidden = true;
  renderSearch();
  $("student-search").focus();
});
$("record-visit").addEventListener("click", startVisitFlow);
$("renew-from-sheet").addEventListener("click", startNewSheetFlow);
$("renew-from-success").addEventListener("click", startNewSheetFlow);
$("resolve-payment").addEventListener("click", resolvePayment);
$("admin-entry").addEventListener("click", () => requestDemoPin(() => {
  refreshAdminSelectors();
  selectAdminTab("students");
  showScreen("admin");
}));

$("confirm-cancel").addEventListener("click", () => {
  const cancelAction = pendingCancelAction;
  pendingCancelAction = null;
  pendingConfirmation = null;
  pendingCancelAction = null;
  $("confirm-dialog").close();
  if (cancelAction) cancelAction();
});
$("confirm-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const action = pendingConfirmation;
  pendingConfirmation = null;
  pendingCancelAction = null;
  $("confirm-dialog").close();
  if (action) action();
});
$("pin-cancel").addEventListener("click", () => $("pin-dialog").close());
$("pin-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!DEMO_PINS.includes($("pin-input").value)) {
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
$("confirm-dialog").addEventListener("close", () => { pendingConfirmation = null; pendingCancelAction = null; $("confirm-cancel").textContent = "Cancel"; });
for (const tab of document.querySelectorAll("[data-tab]")) {
  tab.addEventListener("click", () => selectAdminTab(tab.dataset.tab));
}
$("add-student-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("new-name").value.trim();
  if (!name) return;
  const student = makeStudent(name, parseAge($("new-age")), [], [], $("new-chinese-name").value.trim());
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
  student.chineseName = $("edit-chinese-name").value.trim();
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

$("edit-visit-cancel").addEventListener("click", () => $("edit-visit-dialog").close());
$("edit-visit-dialog").addEventListener("close", () => { editingVisitId = null; });
$("edit-visit-form").addEventListener("submit", event => {
  event.preventDefault();
  const target = currentEditedVisit();
  const date = $("edit-visit-date").value;
  if (!target || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayISO()) { toast("Enter a valid past or current date."); return; }
  if (date !== target.visit.date && hasVisitOn(target.student, date)) { toast("A visit already exists on this date."); return; }
  if (date === target.visit.date) { $("edit-visit-dialog").close(); return; }
  const {student,visit} = target;
  const previous = visit.date;
  $("edit-visit-dialog").close();
  askConfirmation("Save corrected date?", `Change ${student.name}'s visit from ${prettyDate(previous)} to ${prettyDate(date)}?`, "Save change", () => {
    visit.date = date;
    currentSheet(student).visits.sort((a,b) => a.date.localeCompare(b.date));
    addLog(`${student.name}: Attendance date changed from ${prettyDate(previous)} to ${prettyDate(date)}`);
    renderEditCorrections(); renderAdminAttendance(); renderAllStudents();
    toast("Attendance date updated.");
  });
});
$("edit-visit-remove").addEventListener("click", () => {
  const target = currentEditedVisit();
  if (!target) return;
  const {student,visit} = target;
  $("edit-visit-dialog").close();
  askConfirmation("Remove attendance entry?", `Remove ${prettyDate(visit.date)} from ${student.name}'s current sheet? This will be added to the log.`, "Remove entry", () => {
    currentSheet(student).visits = currentSheet(student).visits.filter(v => v.id !== visit.id);
    addLog(`${student.name}: Attendance corrected — removed ${prettyDate(visit.date)}`);
    renderEditCorrections(); renderAdminAttendance(); renderAllStudents();
    toast("Attendance entry removed.");
  });
});
$("import-date").max = todayISO();
renderSearch();
refreshAdminSelectors();
renderLog();
