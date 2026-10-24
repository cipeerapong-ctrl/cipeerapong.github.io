const DATABASE_NAME = "class-planner";
const DATABASE_VERSION = 1;
const STORE_NAME = "homework";

let databasePromise;

function openDatabase() {
  if (!("indexedDB" in window)) {
    return Promise.reject(new Error("เบราว์เซอร์นี้ยังไม่รองรับการบันทึกข้อมูลในเครื่อง"));
  }

  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("เปิดฐานข้อมูลการบ้านไม่ได้"));
      request.onblocked = () => reject(new Error("กรุณาปิดแท็บแอพอื่นแล้วลองใหม่"));
    });
  }

  return databasePromise;
}

function transactionPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("บันทึกข้อมูลไม่สำเร็จ"));
    transaction.onabort = () => reject(transaction.error || new Error("ยกเลิกการบันทึกข้อมูล"));
  });
}

export async function listHomework() {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readonly");
  const request = transaction.objectStore(STORE_NAME).getAll();
  const records = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error("อ่านรายการการบ้านไม่ได้"));
  });
  await transactionPromise(transaction);
  return records;
}

export async function saveHomework(task) {
  if (!task?.id || !task?.courseCode || !task?.title?.trim()) {
    throw new Error("กรุณาเลือกวิชาและใส่ชื่องานก่อนบันทึก");
  }
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).put(task);
  await transactionPromise(transaction);
}

export async function deleteHomework(id) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).delete(id);
  await transactionPromise(transaction);
}

export async function exportHomework() {
  const tasks = await listHomework();
  const payload = {
    format: "class-planner-homework",
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks,
  };
  return new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
}

function isValidDate(value) {
  if (value === null) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isValidHomeworkRecord(task) {
  return Boolean(
    task &&
    typeof task.id === "string" && task.id.trim() &&
    typeof task.courseCode === "string" && task.courseCode.trim() &&
    typeof task.title === "string" && task.title.trim() &&
    isValidDate(task.dueDate) &&
    typeof task.notes === "string" &&
    ["pending", "completed"].includes(task.status) &&
    typeof task.createdAt === "string" && !Number.isNaN(Date.parse(task.createdAt)) &&
    typeof task.updatedAt === "string" && !Number.isNaN(Date.parse(task.updatedAt))
  );
}

export async function importHomework(file) {
  if (!(file instanceof File)) throw new Error("ไม่พบไฟล์สำรอง");
  if (file.size > 2_000_000) throw new Error("ไฟล์สำรองมีขนาดใหญ่เกินไป");

  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    throw new Error("อ่านไฟล์ไม่ได้ กรุณาเลือกไฟล์ JSON สำรองจากแอพ");
  }

  if (payload?.format !== "class-planner-homework" || payload?.version !== 1 || !Array.isArray(payload.tasks)) {
    throw new Error("รูปแบบไฟล์สำรองไม่รองรับ");
  }
  if (!payload.tasks.every(isValidHomeworkRecord)) {
    throw new Error("ไฟล์มีรายการการบ้านที่ข้อมูลไม่ครบหรือไม่ถูกต้อง จึงยังไม่ได้นำเข้า");
  }

  const incomingIds = payload.tasks.map((task) => task.id);
  if (new Set(incomingIds).size !== incomingIds.length) {
    throw new Error("ไฟล์มีรหัสรายการซ้ำกัน จึงยังไม่ได้นำเข้า");
  }

  const existing = await listHomework();
  const existingIds = new Set(existing.map((task) => task.id));
  const additions = payload.tasks.filter((task) => !existingIds.has(task.id));

  if (additions.length === 0) return 0;

  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);
  for (const task of additions) store.add(task);
  await transactionPromise(transaction);
  return additions.length;
}
