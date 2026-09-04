const STORAGE_KEY = "karadaRoutine.v1";
const IMAGE_DB_NAME = "karadaRoutine.v1.images";
const IMAGE_STORE = "cards";

const state = {
  exercises: [],
  habits: ["", "", "", "", "", "", "", ""],
  imageFits: {},
  filter: "すべて",
  view: "home",
  categoryId: null,
  categoryPage: 1,
  player: null,
  queue: [],
  queueIndex: 0,
  currentExercise: null,
  pendingPlay: null
};

let pendingPhotoId = null;
let pendingBoardId = null;
let currentBoardId = null;
let selectedBoardId = null;
let imageDb = null;
let boardDrag = null;

const parts = ["すべて", "首", "肩・背中", "腰", "股関節", "脚", "全身", "その他"];

const CATEGORIES = {
  "minutes-5": { group: "Minutes整体", name: "5分" },
  "minutes-10": { group: "Minutes整体", name: "10分" },
  "minutes-15": { group: "Minutes整体", name: "15分" },
  "minutes-solid": { group: "Minutes整体", name: "しっかり" },
  "stretch-face": { group: "ストレッチ・ツボ押し", name: "顔" },
  "stretch-neck": { group: "ストレッチ・ツボ押し", name: "首・肩・腕" },
  "stretch-waist": { group: "ストレッチ・ツボ押し", name: "腰" },
  "stretch-foot": { group: "ストレッチ・ツボ押し", name: "足" },
  "tools-towel": { group: "物を使う整体", name: "タオル" },
  "tools-roller": { group: "物を使う整体", name: "ローラー" },
  "tools-chair": { group: "物を使う整体", name: "椅子" },
  "tools-wall": { group: "物を使う整体", name: "壁" },
  "beauty-goddess": { group: "女神・お出かけ前", name: "女神" },
  "beauty-hair": { group: "女神・お出かけ前", name: "髪型" },
  "beauty-makeup": { group: "女神・お出かけ前", name: "メイク" },
  "beauty-yuri": { group: "女神・お出かけ前", name: "ゆりに施す" }
};

const $ = (id) => document.getElementById(id);

function normalizeHabits(list) {
  const next = Array.isArray(list) ? list.map(x => String(x ?? "")) : [];
  while (next.length < 8) next.push("");
  return next.slice(0, 8);
}

function normalizeImageFits(obj) {
  const out = {};
  if (!obj || typeof obj !== "object") return out;
  Object.entries(obj).forEach(([id, value]) => {
    if (!id || !value || typeof value !== "object") return;
    out[id] = clampFit({
      scale: Number(value.scale),
      x: Number(value.x),
      y: Number(value.y)
    });
  });
  return out;
}

function clampFit(fit) {
  const scale = Math.min(3, Math.max(1, Number.isFinite(fit.scale) ? fit.scale : 1));
  const max = (scale - 1) * 50;
  const x = Number.isFinite(fit.x) ? fit.x : 0;
  const y = Number.isFinite(fit.y) ? fit.y : 0;
  return {
    scale,
    x: Math.min(max, Math.max(-max, x)),
    y: Math.min(max, Math.max(-max, y))
  };
}

function getFit(id) {
  if (!state.imageFits[id]) state.imageFits[id] = { scale: 1, x: 0, y: 0 };
  state.imageFits[id] = clampFit(state.imageFits[id]);
  return state.imageFits[id];
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    state.exercises = Array.isArray(saved.exercises) ? saved.exercises : [];
    state.habits = normalizeHabits(saved.habits);
    state.imageFits = normalizeImageFits(saved.imageFits);
  } catch {
    state.exercises = [];
    state.habits = normalizeHabits([]);
    state.imageFits = {};
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    version: 1,
    exercises: state.exercises,
    habits: state.habits,
    imageFits: state.imageFits,
    savedAt: new Date().toISOString()
  }));
}

function openImageDb() {
  if (imageDb) return Promise.resolve(imageDb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IMAGE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IMAGE_STORE)) {
        req.result.createObjectStore(IMAGE_STORE);
      }
    };
    req.onsuccess = () => {
      imageDb = req.result;
      resolve(imageDb);
    };
    req.onerror = () => reject(req.error);
  });
}

async function putCardImage(id, dataUrl) {
  const db = await openImageDb();
  const tx = db.transaction(IMAGE_STORE, "readwrite");
  tx.objectStore(IMAGE_STORE).put(dataUrl, id);
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getCardImage(id) {
  const db = await openImageDb();
  const store = db.transaction(IMAGE_STORE, "readonly").objectStore(IMAGE_STORE);
  return new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || "");
    req.onerror = () => reject(req.error);
  });
}

async function deleteCardImage(id) {
  const db = await openImageDb();
  const tx = db.transaction(IMAGE_STORE, "readwrite");
  tx.objectStore(IMAGE_STORE).delete(id);
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllCardImages() {
  const db = await openImageDb();
  const store = db.transaction(IMAGE_STORE, "readonly").objectStore(IMAGE_STORE);
  return new Promise((resolve, reject) => {
    const out = {};
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        out[cursor.key] = cursor.value;
        cursor.continue();
      } else {
        resolve(out);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

async function replaceCardImages(images) {
  const db = await openImageDb();
  const tx = db.transaction(IMAGE_STORE, "readwrite");
  const store = tx.objectStore(IMAGE_STORE);
  store.clear();
  Object.entries(images || {}).forEach(([id, dataUrl]) => {
    if (id && typeof dataUrl === "string" && dataUrl.startsWith("data:image/")) {
      store.put(dataUrl, id);
    }
  });
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function applyFitToImg(img, id) {
  const fit = getFit(id);
  img.style.transform = `translate(${fit.x}%, ${fit.y}%) scale(${fit.scale})`;
}

function applyCardImage(id, dataUrl) {
  const card = document.querySelector(`[data-card="${id}"]`);
  if (!card) return;
  const img = card.querySelector("img");
  const placeholder = card.querySelector(".photo-placeholder");
  if (dataUrl) {
    img.src = dataUrl;
    img.hidden = false;
    placeholder.hidden = true;
    card.classList.add("has-photo");
  } else {
    img.removeAttribute("src");
    img.hidden = true;
    placeholder.hidden = false;
    card.classList.remove("has-photo");
  }
}

function applyBoardImage(id, dataUrl) {
  const card = document.querySelector(`[data-board="${id}"]`);
  if (!card) return;
  const img = card.querySelector("img");
  const placeholder = card.querySelector(".photo-placeholder");
  if (dataUrl) {
    img.src = dataUrl;
    img.hidden = false;
    placeholder.hidden = true;
    applyFitToImg(img, id);
  } else {
    img.removeAttribute("src");
    img.style.transform = "";
    img.hidden = true;
    placeholder.hidden = false;
  }
}

async function loadHomeImages() {
  try {
    const images = await getAllCardImages();
    document.querySelectorAll("[data-card]").forEach(card => {
      applyCardImage(card.dataset.card, images[card.dataset.card] || "");
    });
    document.querySelectorAll("[data-board]").forEach(card => {
      applyBoardImage(card.dataset.board, images[card.dataset.board] || "");
    });
  } catch {
    document.querySelectorAll("[data-card]").forEach(card => applyCardImage(card.dataset.card, ""));
    document.querySelectorAll("[data-board]").forEach(card => applyBoardImage(card.dataset.board, ""));
  }
}

function renderHabits() {
  document.querySelectorAll("[data-habit]").forEach(el => {
    const i = Number(el.dataset.habit);
    const value = state.habits[i] || "";
    if (el.value !== value) el.value = value;
  });
}

function readImageDataUrl(file, max = 720) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    };
    img.src = url;
  });
}

function setSelectedBoard(id) {
  selectedBoardId = id;
  document.querySelectorAll("[data-board]").forEach(card => {
    card.classList.toggle("selected", card.dataset.board === id);
  });
}

function refreshBoardPreview(dataUrl) {
  const img = $("boardPreviewImg");
  const hint = $("boardEmptyHint");
  const hasImage = Boolean(dataUrl);
  if (hasImage) {
    img.src = dataUrl;
    img.hidden = false;
    hint.hidden = true;
    applyFitToImg(img, currentBoardId);
  } else {
    img.removeAttribute("src");
    img.style.transform = "";
    img.hidden = true;
    hint.hidden = false;
  }
  const fit = currentBoardId ? getFit(currentBoardId) : { scale: 1 };
  $("boardZoom").value = String(fit.scale);
  $("boardZoomOut").disabled = !hasImage;
  $("boardZoomIn").disabled = !hasImage;
  $("boardZoom").disabled = !hasImage;
  $("boardResetBtn").disabled = !hasImage;
  $("boardDeleteBtn").disabled = !hasImage;
}

async function openBoardDialog(id) {
  const card = document.querySelector(`[data-board="${id}"]`);
  if (!card) return;
  currentBoardId = id;
  setSelectedBoard(id);
  $("boardTitle").textContent = card.querySelector(".photo-label")?.textContent || "画像";
  $("boardMessage").textContent = "";
  let dataUrl = "";
  try {
    dataUrl = await getCardImage(id);
  } catch {}
  refreshBoardPreview(dataUrl);
  if (!$("boardDialog").open) $("boardDialog").showModal();
}

function closeBoardDialog() {
  $("boardDialog").close();
  currentBoardId = null;
}

async function setBoardImage(id, file) {
  const dataUrl = await readImageDataUrl(file, 1200);
  await putCardImage(id, dataUrl);
  state.imageFits[id] = { scale: 1, x: 0, y: 0 };
  saveState();
  applyBoardImage(id, dataUrl);
  if (currentBoardId === id) refreshBoardPreview(dataUrl);
}

function updateBoardFit(partial) {
  if (!currentBoardId) return;
  const fit = getFit(currentBoardId);
  Object.assign(fit, partial);
  state.imageFits[currentBoardId] = clampFit(fit);
  const img = $("boardPreviewImg");
  if (!img.hidden) applyFitToImg(img, currentBoardId);
  const cardImg = document.querySelector(`[data-board="${currentBoardId}"] img`);
  if (cardImg && !cardImg.hidden) applyFitToImg(cardImg, currentBoardId);
  $("boardZoom").value = String(state.imageFits[currentBoardId].scale);
}

function bumpBoardZoom(delta) {
  if (!currentBoardId || $("boardPreviewImg").hidden) return;
  const fit = getFit(currentBoardId);
  updateBoardFit({ scale: Math.round((fit.scale + delta) * 20) / 20 });
  saveState();
}

async function pasteBoardImage(id) {
  if (!id) return false;
  if (navigator.clipboard && navigator.clipboard.read) {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find(t => t.startsWith("image/"));
      if (!type) continue;
      const blob = await item.getType(type);
      await setBoardImage(id, blob);
      return true;
    }
  }
  return false;
}

function fileFromPasteEvent(event) {
  const items = event.clipboardData?.items;
  if (!items) return null;
  for (const item of items) {
    if (item.type.startsWith("image/")) return item.getAsFile();
  }
  return null;
}

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseTime(value) {
  const v = String(value).trim();
  if (!v) return NaN;
  if (/^\d+$/.test(v)) return Number(v);
  const p = v.split(":").map(Number);
  if (p.some(Number.isNaN)) return NaN;
  if (p.length === 2) return p[0] * 60 + p[1];
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  return NaN;
}

function formatTime(seconds) {
  seconds = Math.max(0, Math.round(seconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h) return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  return `${m}:${String(s).padStart(2,"0")}`;
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}秒`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}分${s}秒` : `${m}分`;
}

function getYouTubeId(url) {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return u.pathname.split("/").filter(Boolean)[0] || null;
    if (host.endsWith("youtube.com")) {
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      const chunks = u.pathname.split("/").filter(Boolean);
      const marker = chunks.findIndex(x => ["shorts", "embed", "live"].includes(x));
      if (marker >= 0 && chunks[marker + 1]) return chunks[marker + 1];
    }
  } catch {}
  return null;
}

function exerciseDuration(ex) {
  return Math.max(0, ex.end - ex.start);
}

function renderFilters() {
  $("filters").innerHTML = parts.map(part => `
    <button class="filter-btn ${state.filter === part ? "active" : ""}" data-filter="${part}">${part}</button>
  `).join("");

  document.querySelectorAll("[data-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.filter = btn.dataset.filter;
      renderFilters();
      renderLibrary();
    });
  });
}

function renderLibrary() {
  const items = state.exercises.filter(ex => state.filter === "すべて" || ex.part === state.filter);
  const list = $("libraryList");

  if (!items.length) {
    list.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <p>${state.exercises.length ? "この部位の登録はまだありません。" : "まだ整体が登録されていません。写真カードから「＋ 追加」で登録できます。"}</p>
      </div>`;
    return;
  }

  list.innerHTML = items.map(ex => {
    const videoId = ex.videoId || getYouTubeId(ex.url);
    const thumb = videoId
      ? `<img src="${youtubeThumbUrl(videoId)}" alt="">`
      : "";
    return `
      <article class="exercise-card library-video-card">
        <div class="yt-thumb">${thumb}</div>
        <div class="library-video-body">
          <h3>${escapeHtml(ex.name)}</h3>
          <div class="card-meta">${formatTime(ex.start)} → ${formatTime(ex.end)} ・ ${formatDuration(exerciseDuration(ex))}</div>
          <button type="button" class="primary-btn library-play-btn" data-play="${ex.id}">▶ 再生</button>
        </div>
        <button type="button" class="card-menu-btn" data-menu="${ex.id}" aria-label="メニュー" aria-haspopup="true">…</button>
        <div class="card-menu" data-menu-panel="${ex.id}">
          <button type="button" data-edit="${ex.id}">編集</button>
          <button type="button" class="card-menu-delete" data-delete="${ex.id}">削除</button>
        </div>
      </article>`;
  }).join("");

  list.querySelectorAll(".yt-thumb img").forEach(img => {
    img.addEventListener("error", () => { img.hidden = true; });
  });
  list.querySelectorAll("[data-play]").forEach(btn => btn.addEventListener("click", () => playSingle(btn.dataset.play)));
  list.querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", () => {
    closeCategoryMenus();
    openEditDialog(btn.dataset.edit);
  }));
  list.querySelectorAll("[data-delete]").forEach(btn => btn.addEventListener("click", () => {
    closeCategoryMenus();
    if (!confirm("この動画を削除しますか？")) return;
    removeExercise(btn.dataset.delete);
  }));
  list.querySelectorAll("[data-menu]").forEach(btn => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const menu = list.querySelector(`[data-menu-panel="${btn.dataset.menu}"]`);
      const willOpen = !menu.classList.contains("open");
      closeCategoryMenus();
      if (willOpen) menu.classList.add("open");
    });
  });
  list.querySelectorAll(".card-menu").forEach(menu => {
    menu.addEventListener("click", (event) => event.stopPropagation());
  });
}

const CATEGORY_PAGE_SIZE = 10;

function renderCategoryList() {
  if (state.view !== "category" || !state.categoryId) return;
  const items = state.exercises.filter(ex => ex.categoryId === state.categoryId);
  const list = $("categoryList");
  if (!items.length) {
    list.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <p>この項目の動画はまだありません。「＋ 追加」から登録できます。</p>
      </div>`;
    return;
  }

  const totalPages = Math.max(1, Math.ceil(items.length / CATEGORY_PAGE_SIZE));
  if (state.categoryPage > totalPages) state.categoryPage = totalPages;
  if (state.categoryPage < 1) state.categoryPage = 1;
  const start = (state.categoryPage - 1) * CATEGORY_PAGE_SIZE;
  const pageItems = items.slice(start, start + CATEGORY_PAGE_SIZE);

  const cards = pageItems.map(ex => {
    const videoId = ex.videoId || getYouTubeId(ex.url);
    const thumb = videoId
      ? `<img src="${youtubeThumbUrl(videoId)}" alt="">`
      : "";
    return `
      <article class="exercise-card category-video-card">
        <div class="yt-thumb">${thumb}</div>
        <div class="category-video-body">
          <h3>${escapeHtml(ex.name)}</h3>
          <div class="card-meta">${formatTime(ex.start)} → ${formatTime(ex.end)} ・ ${formatDuration(exerciseDuration(ex))}</div>
          <button type="button" class="primary-btn category-play-btn" data-play="${ex.id}">▶ 再生</button>
        </div>
        <button type="button" class="card-menu-btn" data-menu="${ex.id}" aria-label="メニュー" aria-haspopup="true">…</button>
        <div class="card-menu" data-menu-panel="${ex.id}">
          <button type="button" data-edit="${ex.id}">編集</button>
          <button type="button" class="card-menu-delete" data-delete="${ex.id}">削除</button>
        </div>
      </article>`;
  }).join("");

  const pager = totalPages > 1 ? `
    <div class="category-pager">
      <button type="button" class="ghost-btn" data-page-prev ${state.categoryPage <= 1 ? "disabled" : ""}>← 前へ</button>
      <span class="category-page-status">${state.categoryPage} / ${totalPages}</span>
      <button type="button" class="ghost-btn" data-page-next ${state.categoryPage >= totalPages ? "disabled" : ""}>次へ →</button>
    </div>` : "";

  list.innerHTML = cards + pager;

  list.querySelectorAll(".yt-thumb img").forEach(img => {
    img.addEventListener("error", () => { img.hidden = true; });
  });
  list.querySelectorAll("[data-play]").forEach(btn => btn.addEventListener("click", () => playSingle(btn.dataset.play)));
  list.querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", () => {
    closeCategoryMenus();
    openEditDialog(btn.dataset.edit);
  }));
  list.querySelectorAll("[data-delete]").forEach(btn => btn.addEventListener("click", () => {
    closeCategoryMenus();
    if (!confirm("この動画を削除しますか？")) return;
    removeExercise(btn.dataset.delete);
  }));
  list.querySelectorAll("[data-menu]").forEach(btn => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const menu = list.querySelector(`[data-menu-panel="${btn.dataset.menu}"]`);
      const willOpen = !menu.classList.contains("open");
      closeCategoryMenus();
      if (willOpen) menu.classList.add("open");
    });
  });
  list.querySelectorAll(".card-menu").forEach(menu => {
    menu.addEventListener("click", (event) => event.stopPropagation());
  });
  list.querySelector("[data-page-prev]")?.addEventListener("click", () => {
    state.categoryPage -= 1;
    renderCategoryList();
    window.scrollTo(0, 0);
  });
  list.querySelector("[data-page-next]")?.addEventListener("click", () => {
    state.categoryPage += 1;
    renderCategoryList();
    window.scrollTo(0, 0);
  });
}

function openCategory(id) {
  if (!CATEGORIES[id]) return;
  state.view = "category";
  state.categoryId = id;
  state.categoryPage = 1;
  $("homeView").classList.add("hidden");
  $("categoryView").classList.remove("hidden");
  $("categoryKicker").textContent = CATEGORIES[id].group;
  $("categoryTitle").textContent = CATEGORIES[id].name;
  renderCategoryList();
  window.scrollTo(0, 0);
}

function closeCategory() {
  state.view = "home";
  state.categoryId = null;
  $("categoryView").classList.add("hidden");
  $("homeView").classList.remove("hidden");
}

function renderAll() {
  renderFilters();
  renderLibrary();
  renderHabits();
  renderCategoryList();
}

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}

function openAddDialog(categoryId) {
  $("dialogTitle").textContent = "整体を追加";
  $("exerciseForm").reset();
  $("exerciseId").value = "";
  $("categoryIdInput").value = categoryId || "";
  $("deleteBtn").classList.add("hidden");
  $("formError").textContent = "";
  $("exerciseDialog").showModal();
}

function openEditDialog(id) {
  const ex = state.exercises.find(x => x.id === id);
  if (!ex) return;
  $("dialogTitle").textContent = "整体を編集";
  $("exerciseId").value = ex.id;
  $("categoryIdInput").value = ex.categoryId || "";
  $("nameInput").value = ex.name;
  $("partInput").value = ex.part;
  $("urlInput").value = ex.url;
  $("startInput").value = formatTime(ex.start);
  $("endInput").value = formatTime(ex.end);
  $("memoInput").value = ex.memo || "";
  $("deleteBtn").classList.remove("hidden");
  $("formError").textContent = "";
  $("exerciseDialog").showModal();
}

function closeExerciseDialog() {
  if ($("exerciseDialog").open) $("exerciseDialog").close();
}

function saveExerciseFromForm(event) {
  event.preventDefault();
  const id = $("exerciseId").value || uid();
  const name = $("nameInput").value.trim();
  const part = $("partInput").value;
  const url = $("urlInput").value.trim();
  const videoId = getYouTubeId(url);
  const start = parseTime($("startInput").value);
  const end = parseTime($("endInput").value);
  const memo = $("memoInput").value.trim();

  let error = "";
  if (!name) error = "名前を入力してください。";
  else if (!videoId) error = "YouTubeのURLを確認してください。";
  else if (!Number.isFinite(start) || start < 0) error = "開始時間を確認してください。";
  else if (!Number.isFinite(end) || end <= start) error = "終了時間は開始時間より後にしてください。";

  if (error) {
    $("formError").textContent = error;
    return;
  }

  const item = { id, name, part, url, videoId, start: Math.round(start), end: Math.round(end), memo };
  const categoryId = $("categoryIdInput").value;
  if (CATEGORIES[categoryId]) item.categoryId = categoryId;
  const existing = state.exercises.findIndex(x => x.id === id);
  if (existing >= 0) state.exercises[existing] = item;
  else state.exercises.unshift(item);

  saveState();
  closeExerciseDialog();
  renderAll();
}

function removeExercise(id) {
  state.exercises = state.exercises.filter(x => x.id !== id);
  saveState();
  closeExerciseDialog();
  renderAll();
}

function deleteExerciseById(id) {
  const ex = state.exercises.find(x => x.id === id);
  if (!ex) return;
  if (!confirm(`「${ex.name}」を削除しますか？`)) return;
  removeExercise(id);
}

function closeCategoryMenus() {
  document.querySelectorAll(".card-menu.open").forEach(menu => {
    menu.classList.remove("open");
  });
}

function youtubeThumbUrl(videoId) {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}

function deleteCurrentExercise() {
  const id = $("exerciseId").value;
  if (id) deleteExerciseById(id);
}

function playSingle(id) {
  const ex = state.exercises.find(x => x.id === id);
  if (!ex) return;
  state.queue = [id];
  state.queueIndex = 0;
  openPlayerFor(ex);
}

function openPlayerFor(ex) {
  state.currentExercise = ex;
  $("playerPart").textContent = ex.part;
  $("playerTitle").textContent = ex.name;
  $("playerRange").textContent = `${formatTime(ex.start)} → ${formatTime(ex.end)}`;
  $("playerMemo").textContent = ex.memo || "";
  $("prevBtn").disabled = state.queueIndex <= 0;
  $("nextBtn").textContent = state.queueIndex >= state.queue.length - 1 ? "終了" : "次へ →";

  if (!$("playerDialog").open) $("playerDialog").showModal();

  const request = { videoId: ex.videoId, startSeconds: ex.start, endSeconds: ex.end };
  if (state.player && typeof state.player.loadVideoById === "function") {
    state.player.loadVideoById(request);
  } else {
    state.pendingPlay = request;
  }
}

function closePlayer() {
  if (state.player && typeof state.player.stopVideo === "function") state.player.stopVideo();
  $("playerDialog").close();
}

function goNext() {
  if (state.queueIndex >= state.queue.length - 1) {
    closePlayer();
    return;
  }
  state.queueIndex += 1;
  const ex = state.exercises.find(x => x.id === state.queue[state.queueIndex]);
  if (ex) openPlayerFor(ex);
}

function goPrev() {
  if (state.queueIndex <= 0) return;
  state.queueIndex -= 1;
  const ex = state.exercises.find(x => x.id === state.queue[state.queueIndex]);
  if (ex) openPlayerFor(ex);
}

window.onYouTubeIframeAPIReady = function () {
  state.player = new YT.Player("youtubePlayer", {
    width: "100%",
    height: "100%",
    playerVars: {
      playsinline: 1,
      rel: 0
    },
    events: {
      onReady: () => {
        if (state.pendingPlay) {
          state.player.loadVideoById(state.pendingPlay);
          state.pendingPlay = null;
        }
      },
      onStateChange: (event) => {
        if (event.data === YT.PlayerState.ENDED && $("playerDialog").open) {
          // 区間の終了後は自動で次に進めず、利用者が姿勢を整えてから「次へ」を押せる設計。
        }
      }
    }
  });
};

async function exportBackup() {
  $("transferMessage").textContent = "書き出し中...";
  let cardImages = {};
  try {
    cardImages = await getAllCardImages();
  } catch {}
  const data = {
    app: "karada-routine",
    version: 1,
    exportedAt: new Date().toISOString(),
    exercises: state.exercises,
    habits: state.habits,
    imageFits: state.imageFits,
    cardImages
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  const date = new Date().toISOString().slice(0,10);
  a.href = URL.createObjectURL(blob);
  a.download = `karada-routine-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  $("transferMessage").textContent = "バックアップを書き出しました。";
}

async function importBackup(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data.exercises)) throw new Error();
    const clean = data.exercises.filter(ex =>
      ex && ex.id && ex.name && ex.part && ex.url && ex.videoId &&
      Number.isFinite(ex.start) && Number.isFinite(ex.end) && ex.end > ex.start
    );
    state.exercises = clean;
    if (Array.isArray(data.habits)) state.habits = normalizeHabits(data.habits);
    if (data.imageFits && typeof data.imageFits === "object") {
      state.imageFits = normalizeImageFits(data.imageFits);
    }
    saveState();
    if (data.cardImages && typeof data.cardImages === "object") {
      await replaceCardImages(data.cardImages);
    }
    renderAll();
    await loadHomeImages();
    $("transferMessage").textContent = `${clean.length}件を読み込みました。`;
  } catch {
    $("transferMessage").textContent = "このファイルは読み込めませんでした。";
  }
}

$("closeDialogBtn").addEventListener("click", closeExerciseDialog);
$("cancelBtn").addEventListener("click", closeExerciseDialog);
$("exerciseForm").addEventListener("submit", saveExerciseFromForm);
$("deleteBtn").addEventListener("click", deleteCurrentExercise);

$("closePlayerBtn").addEventListener("click", closePlayer);
$("nextBtn").addEventListener("click", goNext);
$("prevBtn").addEventListener("click", goPrev);

$("transferBtn").addEventListener("click", () => {
  $("transferMessage").textContent = "";
  $("transferDialog").showModal();
});
$("closeTransferBtn").addEventListener("click", () => $("transferDialog").close());
$("exportBtn").addEventListener("click", exportBackup);
$("importInput").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) importBackup(file);
  e.target.value = "";
});

document.querySelectorAll("[data-card]").forEach(card => {
  card.addEventListener("click", () => openCategory(card.dataset.card));
});

document.querySelectorAll("[data-photo-edit]").forEach(btn => {
  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    pendingPhotoId = btn.dataset.photoEdit;
    pendingBoardId = null;
    $("photoInput").click();
  });
});

$("categoryBackBtn").addEventListener("click", closeCategory);
$("categoryAddBtn").addEventListener("click", () => openAddDialog(state.categoryId));
document.addEventListener("click", () => closeCategoryMenus());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeCategoryMenus();
});

document.querySelectorAll("[data-board]").forEach(card => {
  card.addEventListener("click", () => openBoardDialog(card.dataset.board));
});

$("photoInput").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  const photoId = pendingPhotoId;
  const boardId = pendingBoardId || currentBoardId;
  e.target.value = "";
  pendingPhotoId = null;
  pendingBoardId = null;
  if (!file) return;
  try {
    if (photoId) {
      const dataUrl = await readImageDataUrl(file);
      await putCardImage(photoId, dataUrl);
      applyCardImage(photoId, dataUrl);
    } else if (boardId) {
      await setBoardImage(boardId, file);
      $("boardMessage").textContent = "画像を入れました。";
    }
  } catch {
    alert("写真を読み込めませんでした。");
  }
});

$("closeBoardBtn").addEventListener("click", closeBoardDialog);
$("boardPasteBtn").addEventListener("click", async () => {
  if (!currentBoardId) return;
  $("boardMessage").textContent = "";
  try {
    const ok = await pasteBoardImage(currentBoardId);
    $("boardMessage").textContent = ok
      ? "貼り付けました。"
      : "クリップボードに画像がありません。画像をコピーして Ctrl+V するか、もう一度貼り付けを押してください。";
  } catch {
    $("boardMessage").textContent = "この環境では貼り付けボタンが使えないので、Ctrl+V か「画像を変更」を使ってください。";
  }
});
$("boardPickBtn").addEventListener("click", () => {
  pendingPhotoId = null;
  pendingBoardId = currentBoardId;
  $("photoInput").click();
});
$("boardResetBtn").addEventListener("click", () => {
  if (!currentBoardId) return;
  state.imageFits[currentBoardId] = { scale: 1, x: 0, y: 0 };
  saveState();
  updateBoardFit({ scale: 1, x: 0, y: 0 });
});
$("boardDeleteBtn").addEventListener("click", async () => {
  if (!currentBoardId) return;
  if (!confirm("この画像を削除しますか？")) return;
  try {
    await deleteCardImage(currentBoardId);
  } catch {}
  delete state.imageFits[currentBoardId];
  saveState();
  applyBoardImage(currentBoardId, "");
  refreshBoardPreview("");
  $("boardMessage").textContent = "削除しました。";
});
$("boardZoom").addEventListener("input", () => {
  updateBoardFit({ scale: Number($("boardZoom").value) });
});
$("boardZoom").addEventListener("change", saveState);
$("boardZoomOut").addEventListener("click", () => bumpBoardZoom(-0.1));
$("boardZoomIn").addEventListener("click", () => bumpBoardZoom(0.1));

$("boardPreview").addEventListener("pointerdown", (e) => {
  if (!currentBoardId || $("boardPreviewImg").hidden) return;
  boardDrag = { x: e.clientX, y: e.clientY };
  $("boardPreview").setPointerCapture(e.pointerId);
});
$("boardPreview").addEventListener("pointermove", (e) => {
  if (!boardDrag || !currentBoardId) return;
  const rect = $("boardPreview").getBoundingClientRect();
  const fit = getFit(currentBoardId);
  updateBoardFit({
    x: fit.x + ((e.clientX - boardDrag.x) / rect.width) * 100,
    y: fit.y + ((e.clientY - boardDrag.y) / rect.height) * 100
  });
  boardDrag = { x: e.clientX, y: e.clientY };
});
const endBoardDrag = () => {
  if (!boardDrag) return;
  boardDrag = null;
  saveState();
};
$("boardPreview").addEventListener("pointerup", endBoardDrag);
$("boardPreview").addEventListener("pointercancel", endBoardDrag);

document.addEventListener("paste", async (event) => {
  if (event.target && (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA")) return;
  const file = fileFromPasteEvent(event);
  if (!file) return;
  const id = currentBoardId || selectedBoardId;
  if (!id) return;
  event.preventDefault();
  try {
    await setBoardImage(id, file);
    if (!$("boardDialog").open) await openBoardDialog(id);
    $("boardMessage").textContent = "貼り付けました。";
  } catch {
    alert("画像を貼り付けできませんでした。");
  }
});

document.querySelectorAll("[data-habit]").forEach(el => {
  el.addEventListener("input", () => {
    const i = Number(el.dataset.habit);
    state.habits[i] = el.value;
    saveState();
  });
});

loadState();
renderAll();
loadHomeImages();
