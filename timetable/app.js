import { SCHEDULE } from "./schedule-data.js";
import { HOLIDAYS } from "./holiday-data.js";
import { deleteHomework, exportHomework, importHomework, listHomework, saveHomework } from "./homework-store.js";

const WEEKDAYS = [
  { number: 1, short: "จันทร์", compact: "จ." },
  { number: 2, short: "อังคาร", compact: "อ." },
  { number: 3, short: "พุธ", compact: "พ." },
  { number: 4, short: "พฤหัสฯ", compact: "พฤ." },
  { number: 5, short: "ศุกร์", compact: "ศ." },
  { number: 6, short: "เสาร์", compact: "ส." },
  { number: 7, short: "อาทิตย์", compact: "อา." },
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const elements = {
  date: $("#today-date"),
  daySelector: $("#day-selector"),
  notices: $("#holiday-notices"),
  classCount: $("#class-count"),
  spotlight: $("#class-spotlight"),
  classList: $("#class-list"),
  homeworkPreview: $("#homework-preview"),
  homeworkView: $("#homework-view"),
  scheduleView: $("#schedule-view"),
  homeworkList: $("#homework-list"),
  homeworkCount: $("#homework-tab-count"),
  overdueCount: $("#overdue-count"),
  soonCount: $("#soon-count"),
  doneCount: $("#done-count"),
  subjectFilter: $("#subject-filter"),
  courseSelect: $("#homework-course"),
  dialog: $("#homework-dialog"),
  form: $("#homework-form"),
  titleInput: $("#homework-title"),
  dueInput: $("#homework-due"),
  notesInput: $("#homework-notes"),
  formError: $("#form-error"),
  saveButton: $("#save-homework"),
  fileInput: $("#backup-file"),
  toast: $("#toast"),
  network: $("#network-status"),
};

const state = {
  now: new Date(),
  today: getBangkokDateParts(new Date()),
  selectedWeekday: getBangkokDateParts(new Date()).weekday,
  tasks: [],
  statusFilter: "pending",
  subjectFilter: "all",
  activeView: "schedule",
  editingId: null,
  toastTimer: null,
};

function getBangkokDateParts(now) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdays = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    weekday: weekdays[values.weekday] || 1,
  };
}

function getBangkokTimeParts(now) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { hour: Number(values.hour), minute: Number(values.minute) };
}

function dateKey(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function dateForWeekday(today, weekday) {
  const date = new Date(Date.UTC(today.year, today.month - 1, today.day));
  const currentWeekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + weekday - currentWeekday);
  return date.toISOString().slice(0, 10);
}

function formatThaiDate(isoDate, options = {}) {
  const date = new Date(`${isoDate}T12:00:00Z`);
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "long",
    year: "numeric",
    ...options,
  }).format(date);
}

function formatTodayLine(parts) {
  const isoDate = dateKey(parts);
  const weekday = WEEKDAYS.find((item) => item.number === parts.weekday)?.short || "วันนี้";
  return `${weekday}ที่ ${formatThaiDate(isoDate)}`;
}

function isoDateDistance(date, today) {
  const target = Date.parse(`${date}T00:00:00Z`);
  const base = Date.parse(`${today}T00:00:00Z`);
  return Math.round((target - base) / 86_400_000);
}

function minutesOfDay(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function getClassStatus(classes, now) {
  const time = getBangkokTimeParts(now);
  const currentMinute = time.hour * 60 + time.minute;
  const sorted = [...classes].sort((a, b) => a.start.localeCompare(b.start));
  const current = sorted.find((item) => currentMinute >= minutesOfDay(item.start) && currentMinute < minutesOfDay(item.end)) || null;
  const next = sorted.find((item) => minutesOfDay(item.start) > currentMinute) || null;
  return { current, next };
}

function getHolidayNotices(holidays, today) {
  return holidays
    .map((holiday) => ({ holiday, distance: isoDateDistance(holiday.date, today) }))
    .filter(({ distance }) => [0, 1, 7].includes(distance))
    .sort((a, b) => a.distance - b.distance || a.holiday.date.localeCompare(b.holiday.date));
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function showToast(message, isError = false) {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle("is-error", isError);
  elements.toast.classList.add("is-visible");
  state.toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 2900);
}

function renderDaySelector() {
  elements.daySelector.innerHTML = WEEKDAYS.map((day) => {
    const date = dateForWeekday(state.today, day.number);
    const selected = state.selectedWeekday === day.number;
    const today = state.today.weekday === day.number;
    const dayNumber = Number(date.slice(-2));
    return `<button class="day-button${selected ? " is-selected" : ""}${today ? " is-today" : ""}" type="button" data-weekday="${day.number}" aria-pressed="${selected}" aria-label="${day.short}ที่ ${dayNumber}${today ? " วันนี้" : ""}">
      <span class="day-short">${day.compact}</span><span class="day-date">${dayNumber}</span>
    </button>`;
  }).join("");
}

function renderNotices() {
  const notices = getHolidayNotices(HOLIDAYS, dateKey(state.today));
  if (!notices.length) {
    elements.notices.innerHTML = "";
    return;
  }
  elements.notices.innerHTML = notices.map(({ holiday, distance }) => {
    const official = holiday.type === "official";
    const distanceText = distance === 0 ? "ถึงวันนี้" : `อีก ${distance} วัน`;
    const kindText = official ? "มีประกาศวันหยุด" : "วันสำคัญ · อาจมีผลต่อการเรียน";
    return `<article class="notice-card${official ? " is-official" : ""}">
      <span class="notice-symbol" aria-hidden="true">${official ? "◷" : "✳"}</span>
      <div class="notice-copy">
        <div class="notice-title-row"><strong>${escapeHTML(holiday.title)}</strong><span class="notice-distance">${distanceText}</span></div>
        <p>${kindText} · ${escapeHTML(holiday.note)} · <a href="${escapeHTML(holiday.sourceUrl)}" target="_blank" rel="noreferrer">แหล่งข้อมูล</a></p>
      </div>
    </article>`;
  }).join("");
}

function renderSpotlight(classes) {
  const selectedIsToday = state.selectedWeekday === state.today.weekday;
  const { current, next } = getClassStatus(classes, state.now);
  let focusClass = null;
  let label = "";
  if (selectedIsToday && current) {
    focusClass = current;
    label = focusClass.kind === "routine" ? "กำลังทำกิจกรรม" : "กำลังเรียนอยู่ตอนนี้";
  } else if (selectedIsToday && next) {
    focusClass = next;
    label = next.kind === "routine" ? "กิจกรรมถัดไป" : "วิชาถัดไป";
  } else if (!selectedIsToday) {
    focusClass = classes[0] || null;
    label = focusClass ? (focusClass.kind === "routine" ? "กิจกรรมแรกของวัน" : "เริ่มเรียนเวลา") : "วันนี้ไม่มีเรียน";
  }

  if (!focusClass) {
    const message = selectedIsToday ? "วันนี้เรียนครบแล้ว พักผ่อนได้เลย" : "ไม่มีตารางเรียนในวันนี้";
    const selectedDate = dateForWeekday(state.today, state.selectedWeekday);
    elements.spotlight.innerHTML = `<span class="spotlight-icon" aria-hidden="true">☀</span><div class="spotlight-copy"><p class="spotlight-label">${selectedIsToday ? "ALL DONE" : "DAY OFF"}</p><p class="spotlight-title">${message}</p><p class="spotlight-meta">${escapeHTML(formatThaiDate(selectedDate, { weekday: "long" }))}</p></div>`;
    return;
  }

  const room = focusClass.room ? `ห้อง ${escapeHTML(focusClass.room)}` : "กิจกรรมประจำวัน";
  const code = focusClass.courseCode ? `${escapeHTML(focusClass.courseCode)} · ` : "";
  elements.spotlight.innerHTML = `<span class="spotlight-icon" aria-hidden="true">${focusClass.kind === "routine" ? "☀" : "◷"}</span><div class="spotlight-copy"><p class="spotlight-label">${label}</p><p class="spotlight-title">${code}${escapeHTML(focusClass.title)}</p><p class="spotlight-meta">${escapeHTML(focusClass.start)}–${escapeHTML(focusClass.end)} · ${room}</p></div>`;
}

function renderClassCard(item, index, classes) {
  const selectedIsToday = state.selectedWeekday === state.today.weekday;
  const status = selectedIsToday ? getClassStatus(classes, state.now) : { current: null, next: null };
  const isCurrent = status.current === item;
  const isNext = status.next === item && !status.current;
  const kindClass = item.kind === "routine" ? " is-routine" : "";
  const cardClass = `class-card${isCurrent ? " is-current" : ""}${isNext ? " is-next" : ""}${kindClass}`;
  const code = item.courseCode ? `<p class="class-code">${escapeHTML(item.courseCode)}</p>` : `<p class="class-code">กิจกรรมประจำวัน</p>`;
  const room = item.room ? `<p class="class-room">⌖ ${escapeHTML(item.room)}</p>` : "";
  let stateLabel = "";
  if (isCurrent) stateLabel = `<span class="class-state">กำลังเรียน</span>`;
  else if (isNext) stateLabel = `<span class="class-state is-next-state">ถัดไป</span>`;
  const addButton = item.kind === "class" ? `<button class="add-for-class" type="button" data-quick-add="${escapeHTML(item.courseCode)}" aria-label="เพิ่มการบ้านวิชา ${escapeHTML(item.title)}">＋ จดการบ้าน</button>` : "";
  const previous = classes[index - 1];
  const hasBreak = previous && minutesOfDay(item.start) - minutesOfDay(previous.end) >= 30;
  return `${hasBreak ? `<div class="break-row"><span>พัก</span></div>` : ""}<article class="${cardClass}">
    <span class="class-time">${escapeHTML(item.start)}<br>– ${escapeHTML(item.end)}</span><span class="class-dot" aria-hidden="true"></span>
    <div class="class-content">${stateLabel}${code}<h3 class="class-title">${escapeHTML(item.title)}</h3>${room}</div>${addButton}
  </article>`;
}

function renderSchedule() {
  const selectedDay = WEEKDAYS.find((day) => day.number === state.selectedWeekday);
  const classes = [...(SCHEDULE.weekdays[state.selectedWeekday] || [])].sort((a, b) => a.start.localeCompare(b.start));
  const subjectClasses = classes.filter((item) => item.kind === "class");
  const selectedDate = dateForWeekday(state.today, state.selectedWeekday);
  $("#schedule-heading").textContent = `ตารางเรียนวัน${selectedDay.short}`;
  $("#page-title").textContent = state.selectedWeekday === state.today.weekday ? "ตารางเรียนวันนี้" : `ตารางเรียนวัน${selectedDay.short}`;
  elements.date.textContent = state.selectedWeekday === state.today.weekday ? formatTodayLine(state.today) : `${selectedDay.short}ที่ ${formatThaiDate(selectedDate)}`;
  elements.classCount.textContent = subjectClasses.length ? `${subjectClasses.length} วิชา` : "วันพัก";
  renderSpotlight(classes);

  if (!classes.length) {
    elements.classList.innerHTML = `<div class="empty-day"><span class="empty-day-icon" aria-hidden="true">☁</span><div><h3>วัน${selectedDay.short}ไม่มีเรียน</h3><p>พักให้เต็มที่ แล้วค่อยกลับมาเริ่มใหม่วันจันทร์นะ</p></div></div>`;
  } else {
    elements.classList.innerHTML = classes.map((item, index) => renderClassCard(item, index, classes)).join("");
  }
  $$(".day-button", elements.daySelector).forEach((button) => {
    const selected = Number(button.dataset.weekday) === state.selectedWeekday;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function courseFor(code) {
  return SCHEDULE.courses.find((course) => course.courseCode === code);
}

function taskDueDistance(task, today) {
  return task.dueDate ? isoDateDistance(task.dueDate, today) : null;
}

function taskGroup(task, today) {
  if (task.status === "completed") return "completed";
  const distance = taskDueDistance(task, today);
  if (distance === null) return "noDate";
  if (distance < 0) return "overdue";
  if (distance === 0) return "today";
  if (distance <= 7) return "soon";
  return "later";
}

function sortTasks(tasks, today) {
  return [...tasks].sort((a, b) => {
    const groupOrder = { overdue: 0, today: 1, soon: 2, later: 3, noDate: 4, completed: 5 };
    const groupDifference = groupOrder[taskGroup(a, today)] - groupOrder[taskGroup(b, today)];
    if (groupDifference !== 0) return groupDifference;
    if (!a.dueDate) return a.createdAt.localeCompare(b.createdAt);
    return a.dueDate.localeCompare(b.dueDate) || a.createdAt.localeCompare(b.createdAt);
  });
}

function renderTaskCard(task, today) {
  const course = courseFor(task.courseCode);
  const courseName = course ? course.title : "วิชาที่ไม่อยู่ในตารางปัจจุบัน";
  const completed = task.status === "completed";
  const distance = taskDueDistance(task, today);
  let dueText = "ยังไม่ได้ระบุวันส่ง";
  if (task.dueDate) {
    dueText = distance < 0 ? `เลยกำหนด ${formatThaiDate(task.dueDate)}` : distance === 0 ? `ส่งวันนี้ · ${formatThaiDate(task.dueDate)}` : `กำหนดส่ง ${formatThaiDate(task.dueDate)}`;
  }
  const dueClass = distance !== null && distance < 0 && !completed ? " is-overdue" : "";
  return `<article class="task-card${dueClass}${completed ? " is-done" : ""}">
    <input class="task-check" type="checkbox" data-toggle-task="${escapeHTML(task.id)}" aria-label="ทำเครื่องหมาย ${escapeHTML(task.title)} ว่า${completed ? "ยังไม่เสร็จ" : "เสร็จแล้ว"}" ${completed ? "checked" : ""}>
    <div class="task-main"><h4 class="task-title">${escapeHTML(task.title)}</h4><p class="task-course">${escapeHTML(courseName)}</p><p class="task-due${dueClass}">${escapeHTML(dueText)}</p>${task.notes ? `<p class="task-notes">${escapeHTML(task.notes)}</p>` : ""}</div>
    <div class="task-actions"><button class="small-icon-button" type="button" data-edit-task="${escapeHTML(task.id)}" aria-label="แก้ไข ${escapeHTML(task.title)}">✎</button><button class="small-icon-button" type="button" data-delete-task="${escapeHTML(task.id)}" aria-label="ลบ ${escapeHTML(task.title)}">⌫</button></div>
  </article>`;
}

function visibleTasks() {
  return state.tasks.filter((task) => {
    const statusMatches = state.statusFilter === "all" || task.status === state.statusFilter;
    const subjectMatches = state.subjectFilter === "all" || task.courseCode === state.subjectFilter;
    return statusMatches && subjectMatches;
  });
}

function renderHomework() {
  const today = dateKey(state.today);
  const pending = state.tasks.filter((task) => task.status === "pending");
  const overdue = pending.filter((task) => taskDueDistance(task, today) < 0);
  const dueSoon = pending.filter((task) => {
    const distance = taskDueDistance(task, today);
    return distance !== null && distance >= 0 && distance <= 7;
  });
  const completed = state.tasks.filter((task) => task.status === "completed");
  elements.homeworkCount.textContent = String(pending.length);
  elements.overdueCount.textContent = String(overdue.length);
  elements.soonCount.textContent = String(dueSoon.length);
  elements.doneCount.textContent = String(completed.length);

  const groups = [
    { id: "overdue", title: "เลยกำหนด", marker: "!" },
    { id: "today", title: "ครบกำหนดวันนี้", marker: "•" },
    { id: "soon", title: "อีก 1–7 วัน", marker: "↗" },
    { id: "later", title: "กำหนดส่งภายหลัง", marker: "◷" },
    { id: "noDate", title: "ยังไม่ระบุวันส่ง", marker: "—" },
    { id: "completed", title: "ทำเสร็จแล้ว", marker: "✓" },
  ];
  const tasks = sortTasks(visibleTasks(), today);
  const visibleGroups = state.statusFilter === "completed" ? [groups[5]] : state.statusFilter === "pending" ? groups.slice(0, 5) : groups;
  const markup = visibleGroups.map((group) => {
    const items = tasks.filter((task) => taskGroup(task, today) === group.id);
    if (!items.length) return "";
    return `<section class="homework-group"><h3>${group.marker} ${group.title}<span class="group-count">${items.length}</span></h3><div class="task-list">${items.map((task) => renderTaskCard(task, today)).join("")}</div></section>`;
  }).join("");

  if (!markup) {
    const title = state.statusFilter === "completed" ? "ยังไม่มีงานที่ทำเสร็จ" : "ยังไม่มีงานในรายการนี้";
    const detail = state.statusFilter === "completed" ? "ติ๊กที่ช่องหน้าชื่องานเมื่อทำเสร็จแล้ว งานจะมาอยู่ตรงนี้" : "กด “เพิ่มการบ้าน” เพื่อจดงานที่ได้รับมอบหมายไว้ก่อน";
    elements.homeworkList.innerHTML = `<div class="empty-tasks"><strong>${title}</strong><p>${detail}</p></div>`;
  } else {
    elements.homeworkList.innerHTML = markup;
  }
  renderHomeworkPreview();
}

function renderHomeworkPreview() {
  const today = dateKey(state.today);
  const preview = sortTasks(state.tasks.filter((task) => task.status === "pending" && task.dueDate && taskDueDistance(task, today) <= 7), today).slice(0, 4);
  if (!preview.length) {
    elements.homeworkPreview.innerHTML = `<p class="preview-empty">ยังไม่มีงานใกล้ส่ง จดงานใหม่ได้จากปุ่ม “＋ จดการบ้าน” ในตาราง</p>`;
    return;
  }
  elements.homeworkPreview.innerHTML = preview.map((task) => {
    const course = courseFor(task.courseCode);
    const distance = taskDueDistance(task, today);
    const due = distance < 0 ? `เลยกำหนด ${formatThaiDate(task.dueDate)}` : distance === 0 ? "ครบกำหนดวันนี้" : `ส่ง ${formatThaiDate(task.dueDate, { day: "numeric", month: "short" })}`;
    return `<article class="preview-task${distance < 0 ? " is-overdue" : ""}"><div><strong>${escapeHTML(task.title)}</strong><span>${escapeHTML(course?.title || task.courseCode)} · ${escapeHTML(due)}</span></div></article>`;
  }).join("");
}

function renderSubjectOptions() {
  const options = SCHEDULE.courses.map((course) => `<option value="${escapeHTML(course.courseCode)}">${escapeHTML(course.courseCode)} · ${escapeHTML(course.title)}</option>`).join("");
  elements.courseSelect.innerHTML = `<option value="">เลือกวิชา</option>${options}`;
  elements.subjectFilter.innerHTML = `<option value="all">ทุกวิชา</option>${options}`;
}

function setView(view) {
  state.activeView = view;
  elements.scheduleView.hidden = view !== "schedule";
  elements.homeworkView.hidden = view !== "homework";
  $$(".view-tab").forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (view === "homework") renderHomework();
}

function openHomeworkDialog({ task = null, courseCode = "" } = {}) {
  state.editingId = task?.id || null;
  elements.form.reset();
  elements.formError.hidden = true;
  elements.formError.textContent = "";
  $("#dialog-title").textContent = task ? "แก้ไขการบ้าน" : "เพิ่มการบ้าน";
  elements.saveButton.textContent = task ? "บันทึกการแก้ไข" : "บันทึกงาน";
  elements.courseSelect.value = task?.courseCode || courseCode || "";
  elements.titleInput.value = task?.title || "";
  elements.dueInput.value = task?.dueDate || "";
  elements.notesInput.value = task?.notes || "";
  elements.dialog.showModal();
  requestAnimationFrame(() => elements.titleInput.focus());
}

function closeDialog() {
  elements.dialog.close();
  state.editingId = null;
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : "เกิดข้อผิดพลาด กรุณาลองใหม่";
}

async function refreshTasks() {
  state.tasks = await listHomework();
  renderHomework();
}

async function handleSave(event) {
  event.preventDefault();
  const courseCode = elements.courseSelect.value;
  const title = elements.titleInput.value.trim();
  if (!courseCode || !title) {
    elements.formError.textContent = "เลือกวิชาและใส่ชื่องานก่อนบันทึกนะ";
    elements.formError.hidden = false;
    return;
  }
  const existing = state.tasks.find((task) => task.id === state.editingId);
  const timestamp = new Date().toISOString();
  const task = {
    id: existing?.id || makeId(),
    courseCode,
    title,
    dueDate: elements.dueInput.value || null,
    notes: elements.notesInput.value.trim(),
    status: existing?.status || "pending",
    createdAt: existing?.createdAt || timestamp,
    updatedAt: timestamp,
  };

  try {
    await saveHomework(task);
    await refreshTasks();
    closeDialog();
    showToast(existing ? "บันทึกการแก้ไขแล้ว" : "จดการบ้านไว้แล้ว");
  } catch (error) {
    elements.formError.textContent = errorMessage(error);
    elements.formError.hidden = false;
  }
}

async function toggleTask(id, completed) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  try {
    await saveHomework({ ...task, status: completed ? "completed" : "pending", updatedAt: new Date().toISOString() });
    await refreshTasks();
    showToast(completed ? "ทำเครื่องหมายว่าเสร็จแล้ว" : "ย้ายกลับไปงานค้างแล้ว");
  } catch (error) {
    showToast(errorMessage(error), true);
  }
}

async function removeTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task || !window.confirm(`ลบการบ้าน “${task.title}” ใช่ไหม?`)) return;
  try {
    await deleteHomework(id);
    await refreshTasks();
    showToast("ลบการบ้านแล้ว");
  } catch (error) {
    showToast(errorMessage(error), true);
  }
}

async function handleExport() {
  try {
    const blob = await exportHomework();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `homework-backup-${dateKey(state.today)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
    showToast("ดาวน์โหลดไฟล์สำรองแล้ว");
  } catch (error) {
    showToast(errorMessage(error), true);
  }
}

async function handleImport(file) {
  if (!file) return;
  try {
    const count = await importHomework(file);
    await refreshTasks();
    showToast(count ? `นำเข้า ${count} รายการแล้ว · รายการที่มีอยู่จะไม่ถูกเขียนทับ` : "ไม่พบรายการใหม่ในไฟล์สำรอง");
  } catch (error) {
    showToast(errorMessage(error), true);
  } finally {
    elements.fileInput.value = "";
  }
}

function updateNetworkStatus() {
  const online = navigator.onLine;
  elements.network.textContent = online ? "พร้อมใช้งาน" : "ออฟไลน์ · ข้อมูลในเครื่อง";
  elements.network.classList.toggle("is-offline", !online);
}

function updateClock() {
  const now = new Date();
  const nextToday = getBangkokDateParts(now);
  const changedDate = dateKey(nextToday) !== dateKey(state.today);
  state.now = now;
  state.today = nextToday;
  if (changedDate) state.selectedWeekday = nextToday.weekday;
  renderDaySelector();
  if (changedDate) renderNotices();
  renderSchedule();
  renderHomework();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !["https:", "http:"].includes(location.protocol)) return;
  navigator.serviceWorker.register("./service-worker.js").catch(() => {
    // The timetable remains usable online if the browser declines offline caching.
  });
}

function bindEvents() {
  elements.daySelector.addEventListener("click", (event) => {
    const button = event.target.closest("[data-weekday]");
    if (!button) return;
    state.selectedWeekday = Number(button.dataset.weekday);
    renderDaySelector();
    renderSchedule();
  });

  $$(".view-tab").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  $(".brand").addEventListener("click", (event) => {
    event.preventDefault();
    setView("schedule");
  });
  $$('[data-open-homework]').forEach((button) => button.addEventListener("click", () => setView("homework")));
  $("#add-homework").addEventListener("click", () => openHomeworkDialog());
  elements.classList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-quick-add]");
    if (button) openHomeworkDialog({ courseCode: button.dataset.quickAdd });
  });
  $$('[data-close-dialog]').forEach((button) => button.addEventListener("click", closeDialog));
  elements.form.addEventListener("submit", handleSave);
  elements.dialog.addEventListener("click", (event) => {
    if (event.target === elements.dialog) closeDialog();
  });
  elements.homeworkList.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-task]");
    const deleteButton = event.target.closest("[data-delete-task]");
    if (editButton) openHomeworkDialog({ task: state.tasks.find((task) => task.id === editButton.dataset.editTask) });
    if (deleteButton) await removeTask(deleteButton.dataset.deleteTask);
  });
  elements.homeworkList.addEventListener("change", async (event) => {
    const checkbox = event.target.closest("[data-toggle-task]");
    if (checkbox) await toggleTask(checkbox.dataset.toggleTask, checkbox.checked);
  });
  elements.subjectFilter.addEventListener("change", () => {
    state.subjectFilter = elements.subjectFilter.value;
    renderHomework();
  });
  $$("[data-status-filter]").forEach((button) => button.addEventListener("click", () => {
    state.statusFilter = button.dataset.statusFilter;
    $$("[data-status-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
    renderHomework();
  }));
  $("#export-homework").addEventListener("click", handleExport);
  $("#import-homework").addEventListener("click", () => elements.fileInput.click());
  elements.fileInput.addEventListener("change", () => handleImport(elements.fileInput.files?.[0]));
  window.addEventListener("online", updateNetworkStatus);
  window.addEventListener("offline", updateNetworkStatus);
  window.addEventListener("focus", updateClock);
}

async function initialize() {
  renderSubjectOptions();
  bindEvents();
  renderDaySelector();
  renderNotices();
  renderSchedule();
  updateNetworkStatus();
  registerServiceWorker();
  try {
    state.tasks = await listHomework();
    renderHomework();
  } catch (error) {
    showToast(errorMessage(error), true);
  }
  window.setInterval(updateClock, 60_000);
}

initialize();
