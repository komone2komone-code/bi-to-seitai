const STORAGE_KEY = "karadaRoutine.v1";
const IMAGE_DB_NAME = "karadaRoutine.v1.images";
const IMAGE_STORE = "cards";

const state = {
  exercises: [],
  habits: ["", "", "", "", "", "", "", ""],
  imageFits: {},
  products: { cosmetics: [], bath: [], mama: [], yuri: [] },
  productsReady: false,
  needProductMigration: false,
  needSuppMigration: false,
  categoryNames: {},
  suppNames: {},
  hiddenCategoryIds: [],
  filter: "すべて",
  view: "home",
  categoryId: null,
  suppGroup: null,
  categoryPage: 1,
  player: null,
  queue: [],
  queueIndex: 0,
  currentExercise: null,
  pendingPlay: null
};

let pendingPhotoId = null;
let pendingRenameId = null;
let pendingProductRename = null;
let pendingSuppRename = null;
let pendingBoardId = null;
let currentBoardId = null;
let selectedBoardId = null;
let imageDb = null;
let boardDrag = null;
let pendingProductPick = false;
let pendingIgCoverPick = false;
let pendingProductDataUrl = "";
let pendingIgCoverDataUrl = "";
let productEditGroup = null;
let productEditId = null;

const PRODUCT_GROUP_IDS = ["cosmetics", "bath", "mama", "yuri"];
const HOME_PRODUCT_GROUPS = ["cosmetics", "bath"];
const PRODUCT_LISTS = {
  cosmetics: "cosmeticsList",
  bath: "bathList"
};
const LEGACY_PRODUCT_IDS = {
  cosmetics: "care-cosmetics",
  bath: "care-bath"
};
const SUPP_GROUPS = {
  mama: { coverId: "supp-mama", defaultName: "サプリ" },
  yuri: { coverId: "supp-yuri", defaultName: "漢方" }
};
const LEGACY_SUPP_IDS = {
  mama: "supp-mama",
  yuri: "supp-yuri"
};

function emptyProducts() {
  return { cosmetics: [], bath: [], mama: [], yuri: [] };
}

function isProductGroup(group) {
  return HOME_PRODUCT_GROUPS.includes(group) || !!SUPP_GROUPS[group];
}

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

const CARD_SHORT_LABELS = {
  "minutes-5": "５分",
  "minutes-10": "１０分",
  "minutes-15": "１５分",
  "minutes-solid": "しっかり"
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

function normalizeProductItems(list) {
  if (!Array.isArray(list)) return [];
  return list.map(item => {
    if (!item || typeof item !== "object" || !item.id) return null;
    return {
      id: String(item.id),
      name: String(item.name ?? "").trim() || "名称未設定"
    };
  }).filter(Boolean);
}

function normalizeProducts(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  if (!Array.isArray(raw.cosmetics) || !Array.isArray(raw.bath)) return null;
  return {
    cosmetics: normalizeProductItems(raw.cosmetics),
    bath: normalizeProductItems(raw.bath),
    mama: normalizeProductItems(raw.mama),
    yuri: normalizeProductItems(raw.yuri)
  };
}

function productsNeedSuppMigration(raw) {
  return !(Array.isArray(raw?.mama) && Array.isArray(raw?.yuri));
}

function normalizeCategoryNames(obj) {
  const out = {};
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
  Object.entries(obj).forEach(([id, name]) => {
    if (!CATEGORIES[id]) return;
    const text = String(name ?? "").trim().slice(0, 40);
    if (text) out[id] = text;
  });
  return out;
}

function normalizeHiddenCategoryIds(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map(id => String(id)).filter(id => CATEGORIES[id]))];
}

function getCardLabel(id) {
  if (state.categoryNames[id]) return state.categoryNames[id];
  return CARD_SHORT_LABELS[id] || CATEGORIES[id]?.name || "";
}

function getCategoryName(id) {
  return state.categoryNames[id] || CATEGORIES[id]?.name || "";
}

function normalizeSuppNames(obj) {
  const out = {};
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
  Object.keys(SUPP_GROUPS).forEach(group => {
    const text = String(obj[group] ?? "").trim().slice(0, 40);
    if (!text) return;
    if (group === "mama" && text === "ママ") return;
    if (group === "yuri" && text === "ゆり") return;
    out[group] = text;
  });
  return out;
}

function getSuppName(group) {
  return state.suppNames[group] || SUPP_GROUPS[group]?.defaultName || "";
}

function applySuppLabels() {
  document.querySelectorAll(".photo-card[data-supp]").forEach(card => {
    const label = card.querySelector(".photo-label");
    if (label) label.textContent = getSuppName(card.dataset.supp);
  });
  if (state.view === "supp" && SUPP_GROUPS[state.suppGroup]) {
    $("suppTitle").textContent = getSuppName(state.suppGroup);
  }
}

function applyCategoryLabels() {
  document.querySelectorAll(".photo-card[data-card]:not([data-supp])").forEach(card => {
    const id = card.dataset.card;
    const hidden = state.hiddenCategoryIds.includes(id);
    card.classList.toggle("hidden", hidden);
    if (hidden) {
      card.classList.remove("menu-open");
      return;
    }
    const text = getCardLabel(id);
    const overlay = card.querySelector(".photo-overlay");
    const label = card.querySelector(".photo-label");
    if (overlay) overlay.textContent = text;
    if (label) label.textContent = text;
  });
  document.querySelectorAll("#homeView .home-block").forEach(block => {
    const cards = [...block.querySelectorAll(".photo-card[data-card]:not([data-supp])")];
    if (!cards.length) return;
    block.classList.toggle("hidden", cards.every(card => card.classList.contains("hidden")));
  });
  applySuppLabels();
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    state.exercises = Array.isArray(saved.exercises) ? saved.exercises : [];
    state.habits = normalizeHabits(saved.habits);
    state.imageFits = normalizeImageFits(saved.imageFits);
    state.categoryNames = normalizeCategoryNames(saved.categoryNames);
    state.suppNames = normalizeSuppNames(saved.suppNames);
    state.hiddenCategoryIds = normalizeHiddenCategoryIds(saved.hiddenCategoryIds);
    const products = normalizeProducts(saved.products);
    if (products) {
      state.products = products;
      state.productsReady = true;
      state.needProductMigration = false;
      state.needSuppMigration = productsNeedSuppMigration(saved.products);
    } else {
      state.products = emptyProducts();
      state.productsReady = false;
      state.needProductMigration = true;
      state.needSuppMigration = true;
    }
  } catch {
    state.exercises = [];
    state.habits = normalizeHabits([]);
    state.imageFits = {};
    state.categoryNames = {};
    state.suppNames = {};
    state.hiddenCategoryIds = [];
    state.products = emptyProducts();
    state.productsReady = false;
    state.needProductMigration = true;
    state.needSuppMigration = true;
  }
  migrateSuppCardNames();
}

function migrateSuppCardNames() {
  const prevMama = state.suppNames.mama;
  const prevYuri = state.suppNames.yuri;
  if (!state.suppNames.mama || state.suppNames.mama === "ママ") state.suppNames.mama = "サプリ";
  if (!state.suppNames.yuri || state.suppNames.yuri === "ゆり") state.suppNames.yuri = "漢方";
  if (state.suppNames.mama !== prevMama || state.suppNames.yuri !== prevYuri) saveState();
}

function saveState() {
  const data = {
    version: 1,
    exercises: state.exercises,
    habits: state.habits,
    imageFits: state.imageFits,
    categoryNames: state.categoryNames,
    suppNames: state.suppNames,
    hiddenCategoryIds: state.hiddenCategoryIds,
    savedAt: new Date().toISOString()
  };
  if (state.productsReady) data.products = state.products;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
    applyProductImages(images);
  } catch {
    document.querySelectorAll("[data-card]").forEach(card => applyCardImage(card.dataset.card, ""));
    document.querySelectorAll("[data-board]").forEach(card => applyBoardImage(card.dataset.board, ""));
    applyProductImages({});
  }
}

async function migrateCareProductsIfNeeded() {
  if (!state.needProductMigration && !state.needSuppMigration) {
    state.productsReady = true;
    return;
  }
  let images = {};
  try {
    images = await getAllCardImages();
  } catch {}
  if (state.needProductMigration) {
    Object.entries(LEGACY_PRODUCT_IDS).forEach(([group, id]) => {
      if (images[id] && !state.products[group].some(item => item.id === id)) {
        state.products[group].push({ id, name: "名称未設定" });
      }
    });
    state.needProductMigration = false;
  }
  if (state.needSuppMigration) {
    Object.entries(LEGACY_SUPP_IDS).forEach(([group, id]) => {
      if (images[id] && !state.products[group].some(item => item.id === id)) {
        state.products[group].push({ id, name: "名称未設定" });
      }
    });
    state.needSuppMigration = false;
  }
  state.productsReady = true;
  saveState();
}

function applyProductImage(id, dataUrl) {
  const card = document.querySelector(`[data-product-id="${id}"]`);
  if (!card) return;
  const img = card.querySelector("img");
  if (dataUrl) {
    img.src = dataUrl;
    img.hidden = false;
  } else {
    img.removeAttribute("src");
    img.hidden = true;
  }
}

function applyProductImages(images) {
  PRODUCT_GROUP_IDS.flatMap(group => state.products[group] || []).forEach(item => {
    applyProductImage(item.id, images[item.id] || "");
  });
}

function renderProducts() {
  HOME_PRODUCT_GROUPS.forEach(renderProductGroup);
  if (state.view === "supp" && SUPP_GROUPS[state.suppGroup]) {
    renderProductGroup(state.suppGroup);
  }
  getAllCardImages().then(applyProductImages).catch(() => applyProductImages({}));
}

function productMenuHtml(group, id) {
  if (group === "mama" || group === "yuri") {
    return `
      <button type="button" data-product-rename="${id}">名前の変更</button>
      <button type="button" data-product-photo="${id}">画像の変更</button>
      <button type="button" class="card-menu-delete" data-product-delete="${id}">削除</button>
    `;
  }
  return `
    <button type="button" data-product-edit="${id}">編集</button>
    <button type="button" class="card-menu-delete" data-product-delete="${id}">削除</button>
  `;
}

function renderProductGroup(group) {
  const listId = PRODUCT_LISTS[group] || (state.view === "supp" && state.suppGroup === group ? "suppList" : "");
  const list = $(listId);
  if (!list) return;
  const items = state.products[group] || [];
  if (!items.length) {
    list.innerHTML = `<p class="product-empty">まだ商品がありません。「＋追加」から登録できます。</p>`;
    return;
  }
  list.innerHTML = items.map(item => `
    <article class="product-card" data-product-id="${item.id}" data-product-group="${group}">
      <div class="product-thumb"><img alt="" hidden /></div>
      <span class="product-name">${escapeHtml(item.name)}</span>
      <button type="button" class="card-menu-btn" data-product-menu="${item.id}" aria-label="メニュー">…</button>
      <div class="card-menu" data-product-menu-panel="${item.id}">
        ${productMenuHtml(group, item.id)}
      </div>
    </article>
  `).join("");

  list.querySelectorAll(".product-card").forEach(card => {
    card.addEventListener("click", () => openProductDialog(card.dataset.productGroup, card.dataset.productId));
  });
  list.querySelectorAll("[data-product-menu]").forEach(btn => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      const menu = list.querySelector(`[data-product-menu-panel="${btn.dataset.productMenu}"]`);
      const willOpen = !menu.classList.contains("open");
      closeCategoryMenus();
      if (willOpen) menu.classList.add("open");
    });
  });
  list.querySelectorAll(".card-menu").forEach(menu => {
    menu.addEventListener("click", (event) => event.stopPropagation());
  });
  list.querySelectorAll("[data-product-edit]").forEach(btn => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      closeCategoryMenus();
      openProductDialog(group, btn.dataset.productEdit);
    });
  });
  list.querySelectorAll("[data-product-rename]").forEach(btn => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      closeCategoryMenus();
      openProductRename(group, btn.dataset.productRename);
    });
  });
  list.querySelectorAll("[data-product-photo]").forEach(btn => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      closeCategoryMenus();
      pendingPhotoId = btn.dataset.productPhoto;
      pendingBoardId = null;
      pendingProductPick = false;
      $("photoInput").click();
    });
  });
  list.querySelectorAll("[data-product-delete]").forEach(btn => {
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      closeCategoryMenus();
      deleteProduct(group, btn.dataset.productDelete);
    });
  });
}

function refreshProductPreview() {
  const img = $("productPreviewImg");
  const hint = $("productPreviewHint");
  if (pendingProductDataUrl) {
    img.src = pendingProductDataUrl;
    img.hidden = false;
    hint.hidden = true;
  } else {
    img.removeAttribute("src");
    img.hidden = true;
    hint.hidden = false;
  }
}

async function openProductDialog(group, id) {
  if (!isProductGroup(group)) return;
  if (!state.products[group]) state.products[group] = [];
  productEditGroup = group;
  productEditId = id || "";
  pendingProductDataUrl = "";
  $("productError").textContent = "";
  $("productNameInput").value = "";
  $("productNameInput").placeholder = group === "mama" || group === "yuri" ? "例：鉄" : "例：ジェニフィック";
  if (id) {
    const item = state.products[group].find(x => x.id === id);
    if (!item) return;
    $("productDialogTitle").textContent = "商品を編集";
    $("productNameInput").value = item.name;
    $("productDeleteBtn").classList.remove("hidden");
    try {
      pendingProductDataUrl = await getCardImage(id);
    } catch {
      pendingProductDataUrl = "";
    }
  } else {
    $("productDialogTitle").textContent = "商品を追加";
    $("productDeleteBtn").classList.add("hidden");
  }
  refreshProductPreview();
  if (!$("productDialog").open) $("productDialog").showModal();
}

function closeProductDialog() {
  if ($("productDialog").open) $("productDialog").close();
  productEditGroup = null;
  productEditId = "";
  pendingProductDataUrl = "";
  pendingProductPick = false;
}

async function saveProduct() {
  if (!productEditGroup || !isProductGroup(productEditGroup)) return;
  const name = $("productNameInput").value.trim() || "名称未設定";
  if (!pendingProductDataUrl) {
    $("productError").textContent = "商品画像を追加してください。";
    return;
  }
  $("productError").textContent = "";
  const id = productEditId || `product-${uid()}`;
  if (!Array.isArray(state.products[productEditGroup])) state.products[productEditGroup] = [];
  const list = state.products[productEditGroup];
  const existing = list.findIndex(x => x.id === id);
  if (existing >= 0) list[existing] = { id, name };
  else list.push({ id, name });
  try {
    await putCardImage(id, pendingProductDataUrl);
  } catch {
    $("productError").textContent = "画像を保存できませんでした。";
    return;
  }
  applyCardImage(id, pendingProductDataUrl);
  applyProductImage(id, pendingProductDataUrl);
  state.productsReady = true;
  saveState();
  closeProductDialog();
  renderProducts();
}

async function deleteProduct(group, id) {
  if (!group || !id) return;
  if (!confirm("この商品を削除しますか？")) return;
  state.products[group] = state.products[group].filter(item => item.id !== id);
  const coverIds = Object.values(LEGACY_SUPP_IDS);
  if (!coverIds.includes(id)) {
    try {
      await deleteCardImage(id);
    } catch {}
  }
  state.productsReady = true;
  saveState();
  closeProductDialog();
  renderProducts();
}

async function setPendingProductFile(file) {
  pendingProductDataUrl = await readImageDataUrl(file);
  refreshProductPreview();
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

function parseMediaUrl(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    return new URL(text);
  } catch {
    try {
      return new URL("https://" + text);
    } catch {
      return null;
    }
  }
}

function getYouTubeId(url) {
  const u = parseMediaUrl(url);
  if (!u) return null;
  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtu.be") return u.pathname.split("/").filter(Boolean)[0] || null;
  if (host.endsWith("youtube.com")) {
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    const chunks = u.pathname.split("/").filter(Boolean);
    const marker = chunks.findIndex(x => ["shorts", "embed", "live"].includes(x));
    if (marker >= 0 && chunks[marker + 1]) return chunks[marker + 1];
  }
  return null;
}

function isInstagramUrl(url) {
  const u = parseMediaUrl(url);
  if (!u) return false;
  const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
  if (host !== "instagram.com" && host !== "instagr.am") return false;
  return /\/(reel|reels|p|tv)\//i.test(u.pathname);
}

function detectPlatform(url) {
  if (getYouTubeId(url)) return "youtube";
  if (isInstagramUrl(url)) return "instagram";
  return "";
}

function getPlatform(ex) {
  if (!ex) return "youtube";
  if (ex.platform === "instagram" || isInstagramUrl(ex.url)) return "instagram";
  return "youtube";
}

function igCoverKey(id) {
  return `ig-${id}`;
}

function isValidExercise(ex) {
  if (!ex || !ex.id || !ex.name || !ex.part || !ex.url) return false;
  if (getPlatform(ex) === "instagram") return isInstagramUrl(ex.url);
  const videoId = ex.videoId || getYouTubeId(ex.url);
  if (!videoId) return false;
  return Number.isFinite(ex.start) && Number.isFinite(ex.end) && ex.end > ex.start;
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

function exerciseCardHtml(ex, kind) {
  const ig = getPlatform(ex) === "instagram";
  const cardClass = kind === "library" ? "library-video-card" : "category-video-card";
  const playClass = kind === "library" ? "library-play-btn" : "category-play-btn";
  const thumb = ig
    ? `<div class="yt-thumb ig-thumb" data-ig-cover="${ex.id}"><span class="ig-placeholder">Instagram<br>REEL</span><img alt="" hidden /></div>`
    : `<div class="yt-thumb">${ex.videoId || getYouTubeId(ex.url) ? `<img src="${youtubeThumbUrl(ex.videoId || getYouTubeId(ex.url))}" alt="">` : ""}</div>`;
  const meta = ig
    ? `<div class="card-meta"><span class="platform-tag ig-tag">Instagram</span></div>`
    : `<div class="card-meta"><span class="platform-tag">YouTube</span> ${formatTime(ex.start)} → ${formatTime(ex.end)} ・ ${formatDuration(exerciseDuration(ex))}</div>`;
  const play = ig
    ? `<a class="primary-btn ${playClass}" href="${escapeHtml(ex.url)}" target="_blank" rel="noopener">▶ Instagramで見る</a>`
    : `<button type="button" class="primary-btn ${playClass}" data-play="${ex.id}">▶ 再生</button>`;
  return `
    <article class="exercise-card ${cardClass}">
      ${thumb}
      <div class="${kind === "library" ? "library-video-body" : "category-video-body"}">
        <h3>${escapeHtml(ex.name)}</h3>
        ${meta}
        ${play}
      </div>
      <button type="button" class="card-menu-btn" data-menu="${ex.id}" aria-label="メニュー" aria-haspopup="true">…</button>
      <div class="card-menu" data-menu-panel="${ex.id}">
        <button type="button" data-edit="${ex.id}">編集</button>
        <button type="button" class="card-menu-delete" data-delete="${ex.id}">削除</button>
      </div>
    </article>`;
}

function bindExerciseCardEvents(list) {
  list.querySelectorAll(".yt-thumb img").forEach(img => {
    img.addEventListener("error", () => { img.hidden = true; });
  });
  list.querySelectorAll("[data-play]").forEach(btn => btn.addEventListener("click", () => playSingle(btn.dataset.play)));
  list.querySelectorAll("[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => {
      closeCategoryMenus();
      openEditDialog(btn.dataset.edit);
    });
  });
  list.querySelectorAll("[data-delete]").forEach(btn => {
    btn.addEventListener("click", () => {
      closeCategoryMenus();
      if (!confirm("この動画を削除しますか？")) return;
      removeExercise(btn.dataset.delete);
    });
  });
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
  applyIgCovers(list);
}

async function applyIgCovers(root) {
  const thumbs = [...root.querySelectorAll("[data-ig-cover]")];
  await Promise.all(thumbs.map(async el => {
    try {
      const dataUrl = await getCardImage(igCoverKey(el.dataset.igCover));
      if (!dataUrl) return;
      const img = el.querySelector("img");
      if (!img) return;
      img.src = dataUrl;
      img.hidden = false;
      el.classList.add("has-cover");
    } catch {}
  }));
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

  list.innerHTML = items.map(ex => exerciseCardHtml(ex, "library")).join("");
  bindExerciseCardEvents(list);
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

  const cards = pageItems.map(ex => exerciseCardHtml(ex, "category")).join("");

  const pager = totalPages > 1 ? `
    <div class="category-pager">
      <button type="button" class="ghost-btn" data-page-prev ${state.categoryPage <= 1 ? "disabled" : ""}>← 前へ</button>
      <span class="category-page-status">${state.categoryPage} / ${totalPages}</span>
      <button type="button" class="ghost-btn" data-page-next ${state.categoryPage >= totalPages ? "disabled" : ""}>次へ →</button>
    </div>` : "";

  list.innerHTML = cards + pager;
  bindExerciseCardEvents(list);
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
  if (!CATEGORIES[id] || state.hiddenCategoryIds.includes(id)) return;
  state.view = "category";
  state.categoryId = id;
  state.suppGroup = null;
  state.categoryPage = 1;
  $("homeView").classList.add("hidden");
  $("suppView").classList.add("hidden");
  $("categoryView").classList.remove("hidden");
  $("categoryKicker").textContent = CATEGORIES[id].group;
  $("categoryTitle").textContent = getCategoryName(id);
  renderCategoryList();
  window.scrollTo(0, 0);
}

function closeCategory() {
  showHome();
}

function openSuppList(group) {
  if (!SUPP_GROUPS[group]) return;
  state.view = "supp";
  state.suppGroup = group;
  state.categoryId = null;
  $("homeView").classList.add("hidden");
  $("categoryView").classList.add("hidden");
  $("suppView").classList.remove("hidden");
  $("suppKicker").textContent = "サプリ・漢方";
  $("suppTitle").textContent = getSuppName(group);
  renderProducts();
  window.scrollTo(0, 0);
}

function showHome() {
  state.view = "home";
  state.categoryId = null;
  state.suppGroup = null;
  $("categoryView").classList.add("hidden");
  $("suppView").classList.add("hidden");
  $("homeView").classList.remove("hidden");
}

function renderAll() {
  applyCategoryLabels();
  renderFilters();
  renderLibrary();
  renderHabits();
  renderCategoryList();
  renderProducts();
}

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}

function syncExerciseFormPlatform() {
  const platform = detectPlatform($("urlInput").value) || "youtube";
  const ig = platform === "instagram";
  $("urlLabel").textContent = ig ? "Instagram URL" : (detectPlatform($("urlInput").value) ? "YouTube URL" : "動画URL");
  $("timeFields").classList.toggle("hidden", ig);
  $("memoField").classList.toggle("hidden", ig);
  $("igCoverField").classList.toggle("hidden", !ig);
  $("startInput").toggleAttribute("required", !ig);
  $("endInput").toggleAttribute("required", !ig);
}

function refreshIgCoverPreview() {
  const img = $("igCoverPreviewImg");
  const hint = $("igCoverHint");
  if (pendingIgCoverDataUrl) {
    img.src = pendingIgCoverDataUrl;
    img.hidden = false;
    hint.hidden = true;
  } else {
    img.removeAttribute("src");
    img.hidden = true;
    hint.hidden = false;
  }
}

async function setPendingIgCoverFile(file) {
  pendingIgCoverDataUrl = await readImageDataUrl(file);
  refreshIgCoverPreview();
}

function openAddDialog(categoryId) {
  $("dialogTitle").textContent = "整体を追加";
  $("exerciseForm").reset();
  $("exerciseId").value = "";
  $("categoryIdInput").value = categoryId || "";
  $("deleteBtn").classList.add("hidden");
  $("formError").textContent = "";
  pendingIgCoverDataUrl = "";
  refreshIgCoverPreview();
  syncExerciseFormPlatform();
  $("exerciseDialog").showModal();
}

async function openEditDialog(id) {
  const ex = state.exercises.find(x => x.id === id);
  if (!ex) return;
  $("dialogTitle").textContent = "整体を編集";
  $("exerciseId").value = ex.id;
  $("categoryIdInput").value = ex.categoryId || "";
  $("nameInput").value = ex.name;
  $("partInput").value = ex.part;
  $("urlInput").value = ex.url;
  $("startInput").value = getPlatform(ex) === "youtube" ? formatTime(ex.start) : "";
  $("endInput").value = getPlatform(ex) === "youtube" ? formatTime(ex.end) : "";
  $("memoInput").value = ex.memo || "";
  $("deleteBtn").classList.remove("hidden");
  $("formError").textContent = "";
  pendingIgCoverDataUrl = "";
  if (getPlatform(ex) === "instagram") {
    try {
      pendingIgCoverDataUrl = await getCardImage(igCoverKey(ex.id));
    } catch {
      pendingIgCoverDataUrl = "";
    }
  }
  refreshIgCoverPreview();
  syncExerciseFormPlatform();
  $("exerciseDialog").showModal();
}

function closeExerciseDialog() {
  pendingIgCoverDataUrl = "";
  pendingIgCoverPick = false;
  if ($("exerciseDialog").open) $("exerciseDialog").close();
}

async function saveExerciseFromForm(event) {
  event.preventDefault();
  const id = $("exerciseId").value || uid();
  const name = $("nameInput").value.trim();
  const part = $("partInput").value;
  const url = $("urlInput").value.trim();
  const platform = detectPlatform(url);
  const memo = $("memoInput").value.trim();

  let error = "";
  if (!name) error = "名前を入力してください。";
  else if (!platform) error = "YouTubeまたはInstagramのURLを確認してください。";

  let item = { id, name, part, url, platform };
  if (platform === "youtube") {
    const videoId = getYouTubeId(url);
    const start = parseTime($("startInput").value);
    const end = parseTime($("endInput").value);
    if (!videoId) error = "YouTubeのURLを確認してください。";
    else if (!Number.isFinite(start) || start < 0) error = "開始時間を確認してください。";
    else if (!Number.isFinite(end) || end <= start) error = "終了時間は開始時間より後にしてください。";
    item = { ...item, videoId, start: Math.round(start), end: Math.round(end), memo };
  }

  if (error) {
    $("formError").textContent = error;
    return;
  }

  const categoryId = $("categoryIdInput").value;
  if (CATEGORIES[categoryId]) item.categoryId = categoryId;
  const existing = state.exercises.findIndex(x => x.id === id);
  if (existing >= 0) state.exercises[existing] = item;
  else state.exercises.unshift(item);

  if (platform === "instagram" && pendingIgCoverDataUrl) {
    try {
      await putCardImage(igCoverKey(id), pendingIgCoverDataUrl);
    } catch {
      $("formError").textContent = "表紙画像を保存できませんでした。";
      return;
    }
  }

  saveState();
  closeExerciseDialog();
  renderAll();
}

function removeExercise(id) {
  state.exercises = state.exercises.filter(x => x.id !== id);
  saveState();
  closeExerciseDialog();
  renderAll();
  deleteCardImage(igCoverKey(id)).catch(() => {});
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
  document.querySelectorAll(".photo-card.menu-open").forEach(card => {
    card.classList.remove("menu-open");
  });
}

function ensurePhotoCardMenus() {
  document.querySelectorAll(".photo-card[data-card]:not([data-supp])").forEach(card => {
    if (card.querySelector(".photo-card-menu-btn")) return;
    const frame = card.querySelector(".photo-frame");
    if (!frame) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "card-menu-btn photo-card-menu-btn";
    btn.setAttribute("aria-label", "メニュー");
    btn.setAttribute("aria-haspopup", "true");
    btn.textContent = "…";
    const panel = document.createElement("div");
    panel.className = "card-menu";
    panel.innerHTML = `
      <button type="button" data-photo-action="rename">名前の変更</button>
      <button type="button" data-photo-action="photo">写真の変更</button>
      <button type="button" class="card-menu-delete" data-photo-action="delete">削除</button>
    `;
    btn.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const willOpen = !panel.classList.contains("open");
      closeCategoryMenus();
      if (willOpen) {
        panel.classList.add("open");
        card.classList.add("menu-open");
      }
    });
    panel.addEventListener("click", event => event.stopPropagation());
    panel.querySelectorAll("[data-photo-action]").forEach(actionBtn => {
      actionBtn.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        const id = card.dataset.card;
        const action = actionBtn.dataset.photoAction;
        closeCategoryMenus();
        if (action === "rename") openCategoryRename(id);
        if (action === "photo") {
          pendingPhotoId = id;
          pendingBoardId = null;
          pendingProductPick = false;
          $("photoInput").click();
        }
        if (action === "delete") deletePhotoCard(id);
      });
    });
    frame.appendChild(btn);
    card.appendChild(panel);
  });
}

function ensureSuppCardMenus() {
  document.querySelectorAll(".photo-card[data-supp]").forEach(card => {
    if (card.querySelector(".photo-card-menu-btn")) return;
    const frame = card.querySelector(".photo-frame");
    if (!frame) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "card-menu-btn photo-card-menu-btn";
    btn.setAttribute("aria-label", "メニュー");
    btn.setAttribute("aria-haspopup", "true");
    btn.textContent = "…";
    const panel = document.createElement("div");
    panel.className = "card-menu";
    panel.innerHTML = `
      <button type="button" data-supp-action="rename">名前の変更</button>
      <button type="button" data-supp-action="photo">写真の変更</button>
    `;
    btn.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      const willOpen = !panel.classList.contains("open");
      closeCategoryMenus();
      if (willOpen) {
        panel.classList.add("open");
        card.classList.add("menu-open");
      }
    });
    panel.addEventListener("click", event => event.stopPropagation());
    panel.querySelectorAll("[data-supp-action]").forEach(actionBtn => {
      actionBtn.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        const group = card.dataset.supp;
        const action = actionBtn.dataset.suppAction;
        closeCategoryMenus();
        if (action === "rename") openSuppRename(group);
        if (action === "photo") {
          pendingPhotoId = SUPP_GROUPS[group]?.coverId || "";
          pendingBoardId = null;
          pendingProductPick = false;
          if (pendingPhotoId) $("photoInput").click();
        }
      });
    });
    frame.appendChild(btn);
    card.appendChild(panel);
  });
}

function openCategoryRename(id) {
  if (!CATEGORIES[id] || state.hiddenCategoryIds.includes(id)) return;
  pendingProductRename = null;
  pendingSuppRename = null;
  pendingRenameId = id;
  $("categoryRenameInput").value = getCardLabel(id);
  $("categoryRenameDialog").showModal();
  $("categoryRenameInput").focus();
  $("categoryRenameInput").select();
}

function openProductRename(group, id) {
  const item = (state.products[group] || []).find(x => x.id === id);
  if (!item) return;
  pendingRenameId = null;
  pendingSuppRename = null;
  pendingProductRename = { group, id };
  $("categoryRenameInput").value = item.name;
  $("categoryRenameDialog").showModal();
  $("categoryRenameInput").focus();
  $("categoryRenameInput").select();
}

function openSuppRename(group) {
  if (!SUPP_GROUPS[group]) return;
  pendingRenameId = null;
  pendingProductRename = null;
  pendingSuppRename = group;
  $("categoryRenameInput").value = getSuppName(group);
  $("categoryRenameDialog").showModal();
  $("categoryRenameInput").focus();
  $("categoryRenameInput").select();
}

function closeCategoryRename() {
  pendingRenameId = null;
  pendingProductRename = null;
  pendingSuppRename = null;
  if ($("categoryRenameDialog").open) $("categoryRenameDialog").close();
}

function saveCategoryRename() {
  const name = $("categoryRenameInput").value.trim().slice(0, 40);
  if (!name) return;
  if (pendingSuppRename) {
    const group = pendingSuppRename;
    state.suppNames[group] = name;
    saveState();
    closeCategoryRename();
    applySuppLabels();
    return;
  }
  if (pendingProductRename) {
    const { group, id } = pendingProductRename;
    const item = (state.products[group] || []).find(x => x.id === id);
    if (!item) return;
    item.name = name;
    state.productsReady = true;
    saveState();
    closeCategoryRename();
    renderProducts();
    return;
  }
  const id = pendingRenameId;
  if (!CATEGORIES[id]) return;
  state.categoryNames[id] = name;
  saveState();
  closeCategoryRename();
  applyCategoryLabels();
  if (state.view === "category" && state.categoryId === id) {
    $("categoryTitle").textContent = getCategoryName(id);
  }
}

function deletePhotoCard(id) {
  if (!CATEGORIES[id] || state.hiddenCategoryIds.includes(id)) return;
  const hasVideos = state.exercises.some(item => item.categoryId === id);
  const message = hasVideos
    ? "この項目を削除しますか？\n登録されている動画は『すべての動画』に残ります。"
    : "この項目を削除しますか？";
  if (!confirm(message)) return;
  state.hiddenCategoryIds.push(id);
  saveState();
  applyCategoryLabels();
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
  if (getPlatform(ex) === "instagram") {
    window.open(ex.url, "_blank", "noopener");
    return;
  }
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
    categoryNames: state.categoryNames,
    suppNames: state.suppNames,
    hiddenCategoryIds: state.hiddenCategoryIds,
    products: state.products,
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
    const clean = data.exercises.filter(isValidExercise);
    state.exercises = clean;
    if (Array.isArray(data.habits)) state.habits = normalizeHabits(data.habits);
    if (data.imageFits && typeof data.imageFits === "object") {
      state.imageFits = normalizeImageFits(data.imageFits);
    }
    state.categoryNames = normalizeCategoryNames(data.categoryNames);
    state.suppNames = normalizeSuppNames(data.suppNames);
    state.hiddenCategoryIds = normalizeHiddenCategoryIds(data.hiddenCategoryIds);
    const importedProducts = normalizeProducts(data.products);
    if (importedProducts) {
      state.products = importedProducts;
      state.needProductMigration = false;
      state.needSuppMigration = productsNeedSuppMigration(data.products);
      state.productsReady = true;
    } else {
      state.products = emptyProducts();
      state.needProductMigration = true;
      state.needSuppMigration = true;
      state.productsReady = false;
    }
    saveState();
    if (data.cardImages && typeof data.cardImages === "object") {
      await replaceCardImages(data.cardImages);
    }
    await migrateCareProductsIfNeeded();
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
$("urlInput").addEventListener("input", syncExerciseFormPlatform);
$("urlInput").addEventListener("change", syncExerciseFormPlatform);
$("igCoverPickBtn").addEventListener("click", () => {
  pendingPhotoId = null;
  pendingBoardId = null;
  pendingProductPick = false;
  pendingIgCoverPick = true;
  $("photoInput").click();
});
$("igCoverPasteBtn").addEventListener("click", async () => {
  $("formError").textContent = "";
  try {
    if (navigator.clipboard && navigator.clipboard.read) {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find(t => t.startsWith("image/"));
        if (!type) continue;
        const blob = await item.getType(type);
        await setPendingIgCoverFile(blob);
        return;
      }
    }
    $("formError").textContent = "クリップボードに画像がありません。画像をコピーして貼り付けてください。";
  } catch {
    $("formError").textContent = "この環境では貼り付けボタンが使えないので、Ctrl+V か「写真を選択」を使ってください。";
  }
});

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

document.querySelectorAll(".photo-card[data-card]").forEach(card => {
  card.addEventListener("click", event => {
    if (event.target.closest(".photo-card-menu-btn, .card-menu")) return;
    if (card.dataset.supp) {
      openSuppList(card.dataset.supp);
      return;
    }
    openCategory(card.dataset.card);
  });
});

$("categoryBackBtn").addEventListener("click", closeCategory);
$("categoryAddBtn").addEventListener("click", () => openAddDialog(state.categoryId));
$("suppBackBtn").addEventListener("click", showHome);
$("suppAddBtn").addEventListener("click", () => openProductDialog(state.suppGroup, ""));
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
  const productPick = pendingProductPick;
  const igCoverPick = pendingIgCoverPick;
  e.target.value = "";
  pendingPhotoId = null;
  pendingBoardId = null;
  pendingProductPick = false;
  pendingIgCoverPick = false;
  if (!file) return;
  try {
    if (productPick) {
      await setPendingProductFile(file);
    } else if (igCoverPick) {
      await setPendingIgCoverFile(file);
    } else if (photoId) {
      const dataUrl = await readImageDataUrl(file);
      await putCardImage(photoId, dataUrl);
      applyCardImage(photoId, dataUrl);
      applyProductImage(photoId, dataUrl);
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
  pendingProductPick = false;
  pendingIgCoverPick = false;
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
  const file = fileFromPasteEvent(event);
  if ($("exerciseDialog").open && file && detectPlatform($("urlInput").value) === "instagram") {
    event.preventDefault();
    try {
      await setPendingIgCoverFile(file);
    } catch {
      $("formError").textContent = "画像を貼り付けできませんでした。";
    }
    return;
  }
  if ($("productDialog").open && file) {
    event.preventDefault();
    try {
      await setPendingProductFile(file);
    } catch {
      $("productError").textContent = "画像を貼り付けできませんでした。";
    }
    return;
  }
  if (event.target && (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA")) return;
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

document.querySelectorAll("[data-product-add]").forEach(btn => {
  btn.addEventListener("click", () => openProductDialog(btn.dataset.productAdd, ""));
});
$("closeProductBtn").addEventListener("click", closeProductDialog);
$("productCancelBtn").addEventListener("click", closeProductDialog);
$("productSaveBtn").addEventListener("click", () => saveProduct());
$("productDeleteBtn").addEventListener("click", () => deleteProduct(productEditGroup, productEditId));
$("productPickBtn").addEventListener("click", () => {
  pendingPhotoId = null;
  pendingBoardId = null;
  pendingIgCoverPick = false;
  pendingProductPick = true;
  $("photoInput").click();
});
$("productPasteBtn").addEventListener("click", async () => {
  $("productError").textContent = "";
  try {
    if (navigator.clipboard && navigator.clipboard.read) {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find(t => t.startsWith("image/"));
        if (!type) continue;
        const blob = await item.getType(type);
        await setPendingProductFile(blob);
        return;
      }
    }
    $("productError").textContent = "クリップボードに画像がありません。画像をコピーして貼り付けてください。";
  } catch {
    $("productError").textContent = "この環境では貼り付けボタンが使えないので、Ctrl+V か「写真を選択」を使ってください。";
  }
});

$("cancelCategoryRenameBtn").addEventListener("click", closeCategoryRename);
$("saveCategoryRenameBtn").addEventListener("click", saveCategoryRename);
$("categoryRenameDialog").addEventListener("close", () => {
  pendingRenameId = null;
  pendingProductRename = null;
  pendingSuppRename = null;
});
$("categoryRenameInput").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    saveCategoryRename();
  }
});

loadState();
ensurePhotoCardMenus();
ensureSuppCardMenus();
renderAll();
loadHomeImages();
migrateCareProductsIfNeeded().then(() => {
  renderProducts();
});
