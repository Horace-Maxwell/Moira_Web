const statusNode = document.querySelector("#serverStatus");
const versionNode = document.querySelector("#apiVersion");
const resultNode = document.querySelector("#resultBox");
const featureGrid = document.querySelector("#featureGrid");
const guardrailsNode = document.querySelector("#guardrails");
const form = document.querySelector("#chartForm");
const chartImage = document.querySelector("#chartImage");
const emptyChart = document.querySelector("#emptyChart");
const textTabs = document.querySelector("#textTabs");
const eightTextNode = document.querySelector("#eightText");
const noteTextNode = document.querySelector("#noteText");
const appWindow = document.querySelector(".app-window");
const viewTitle = document.querySelector("#viewTitle");
const rowCount = document.querySelector("#rowCount");
const tabButtons = [...document.querySelectorAll(".main-tabs .tab")];
const menus = [...document.querySelectorAll(".menu")];
const menuCommands = [...document.querySelectorAll(".menu-command")];
const views = [...document.querySelectorAll("[data-view-panel]")];
const manageView = document.querySelector("#manageView");
const entryTable = document.querySelector("#entryTable");
const entryImport = document.querySelector("#entryImport");
const saveEntryButton = document.querySelector("#saveEntry");
const exportEntriesButton = document.querySelector("#exportEntries");
const importEntriesButton = document.querySelector("#importEntries");
const exportMriButton = document.querySelector("#exportMri");
const importMriButton = document.querySelector("#importMri");
const deleteEntryButton = document.querySelector("#deleteEntry");
const updateEntryButton = document.querySelector("#updateEntry");
const mriFileInput = document.querySelector("#mriFile");
const packEntryButton = document.querySelector("#packEntry");
const storageKey = "moira-web.entries";
let currentTextPages = null;
let entries = loadEntries();
let autoComputeTimer = null;
let selectedEntryId = entries[0]?.id || null;
let entriesDirty = false;
const monthNames = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];
const viewTitles = {
  chart: "星盤 - 回歸制",
  calculation: "星盤 - 計算",
  eight: "星盤 - 四柱",
  notes: "星盤 - 批注",
  manage: "數據管理 - 回歸制"
};

async function fetchJson(path) {
  const response = await fetch(path, {
    headers: { Accept: "application/json" }
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || `Request failed: ${response.status}`);
  }
  return payload;
}

async function postJson(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || `Request failed: ${response.status}`);
  }
  return payload;
}

function showResult(payload) {
  resultNode.textContent = JSON.stringify(payload, null, 2);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function boundedNumber(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
}

function chartFields() {
  return [
    ...form.querySelectorAll("[name]"),
    ...document.querySelectorAll(`[form="${form.id}"][name]`)
  ];
}

function chartField(name) {
  return form.querySelector(`[name="${name}"]`)
    || document.querySelector(`[form="${form.id}"][name="${name}"]`)
    || form.elements[name];
}

function chartValues() {
  const values = {};
  chartFields().forEach((control) => {
    if (!control.name || control.disabled) {
      return;
    }
    if (control.type === "radio") {
      if (control.checked) {
        values[control.name] = control.value;
      }
      return;
    }
    if (control.type === "checkbox") {
      if (control.checked) {
        values[control.name] = "on";
      }
      return;
    }
    values[control.name] = control.value;
  });
  return values;
}

function setChartValue(name, value) {
  const controls = chartFields().filter((control) => control.name === name);
  controls.forEach((control) => {
    if (control.type === "radio") {
      control.checked = control.value === value;
    } else if (control.type === "checkbox") {
      control.checked = Boolean(value);
    } else {
      control.value = value;
    }
  });
}

function populateMonthSelects() {
  document.querySelectorAll(".moira-date-row select[data-part='month']")
    .forEach((select) => {
      if (select.options.length > 0) {
        return;
      }
      monthNames.forEach((name, index) => {
        const option = document.createElement("option");
        option.value = String(index + 1);
        option.textContent = name;
        select.append(option);
      });
    });
}

function updateDateTimeWidget(scope) {
  const row = document.querySelector(`.moira-date-row[data-datetime='${scope}']`);
  if (!row) {
    return;
  }
  const dateValue = form.elements[`${scope}Date`].value || "2006-04-10";
  const timeValue = form.elements[`${scope}Time`].value || "09:58";
  const [year = "2006", month = "4", day = "10"] = dateValue.split("-");
  const [hourRaw = "9", minute = "58"] = timeValue.split(":");
  let hour = boundedNumber(hourRaw, 9, 0, 23);
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  row.querySelector("[data-part='month']").value = String(Number(month) || 4);
  row.querySelector("[data-part='day']").value = String(Number(day) || 10);
  row.querySelector("[data-part='year']").value = String(Number(year) || 2006);
  row.querySelector("[data-part='hour']").value = String(hour);
  row.querySelector("[data-part='minute']").value = `:${pad2(boundedNumber(minute, 0, 0, 59))}`;
  row.querySelector("[data-part='ampm']").value = ampm;
}

function initializeCurrentDateTimes() {
  const now = new Date();
  const date = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const time = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
  form.elements.birthDate.value = date;
  form.elements.birthTime.value = time;
  form.elements.nowDate.value = date;
  form.elements.nowTime.value = time;
}

function updateAllDateTimeWidgets() {
  updateDateTimeWidget("birth");
  updateDateTimeWidget("now");
}

function syncDateTimeWidget(scope) {
  const row = document.querySelector(`.moira-date-row[data-datetime='${scope}']`);
  if (!row) {
    return;
  }
  const month = boundedNumber(row.querySelector("[data-part='month']").value, 4, 1, 12);
  const day = boundedNumber(row.querySelector("[data-part='day']").value, 10, 1, 31);
  const year = boundedNumber(row.querySelector("[data-part='year']").value, 2006, 1, 9999);
  let hour = boundedNumber(row.querySelector("[data-part='hour']").value, 9, 1, 12);
  const minuteValue = row.querySelector("[data-part='minute']").value.replace(/^:/, "");
  const minute = boundedNumber(minuteValue, 0, 0, 59);
  const ampm = row.querySelector("[data-part='ampm']").value;
  if (ampm === "PM" && hour < 12) {
    hour += 12;
  }
  if (ampm === "AM" && hour === 12) {
    hour = 0;
  }
  form.elements[`${scope}Date`].value = `${year}-${pad2(month)}-${pad2(day)}`;
  form.elements[`${scope}Time`].value = `${pad2(hour)}:${pad2(minute)}`;
  updateDateTimeWidget(scope);
}

function syncAllDateTimeWidgets() {
  syncDateTimeWidget("birth");
  syncDateTimeWidget("now");
}

function wireDateTimeWidgets() {
  document.querySelectorAll(".moira-date-row").forEach((row) => {
    const sync = () => syncDateTimeWidget(row.dataset.datetime);
    row.querySelectorAll("input, select").forEach((control) => {
      control.addEventListener("input", sync);
      control.addEventListener("change", sync);
      control.addEventListener("blur", sync);
    });
  });
}

function switchView(view) {
  const nextView = viewTitles[view] ? view : "chart";
  window.getSelection()?.removeAllRanges();
  appWindow.dataset.currentView = nextView;
  viewTitle.textContent = viewTitles[nextView];
  tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === nextView);
  });
  views.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.viewPanel === nextView);
  });
}

function showTextPage(page) {
  if (!currentTextPages) {
    return;
  }
  const text = currentTextPages[page] || "";
  if (page === "eightCharacters") {
    eightTextNode.textContent = text;
  } else if (page === "notes") {
    noteTextNode.textContent = text;
  } else {
    resultNode.textContent = text;
  }
  textTabs.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.page === page);
  });
}

function activeTextNode() {
  if (appWindow.dataset.currentView === "calculation") {
    return resultNode;
  }
  if (appWindow.dataset.currentView === "eight") {
    return eightTextNode;
  }
  if (appWindow.dataset.currentView === "notes") {
    return noteTextNode;
  }
  return null;
}

function selectNodeText(node) {
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function showChartResult(payload) {
  currentTextPages = payload.textPages || {};
  chartImage.src = payload.chartImage;
  chartImage.hidden = false;
  emptyChart.hidden = true;
  textTabs.hidden = false;
  showTextPage("calculation");
  showTextPage("eightCharacters");
  showTextPage("notes");
}

function compactChartPayload(payload) {
  return {
    status: payload.status,
    mode: payload.mode,
    astroMode: payload.astroMode,
    normalized: payload.normalized,
    textPageLengths: Object.fromEntries(
      Object.entries(payload.textPages || {}).map(([key, value]) => [
        key,
        value.length
      ])
    ),
    packedEntry: payload.packedEntry
  };
}

function featureCard(item) {
  const card = document.createElement("article");
  card.className = "feature-card";

  const title = document.createElement("h3");
  title.textContent = item.title;

  const meta = document.createElement("p");
  meta.textContent = `${item.id} · ${item.type}`;

  const badge = document.createElement("span");
  badge.className = `badge ${item.status === "implemented" ? "done" : ""}`;
  badge.textContent = item.status === "implemented" ? "已接入" : "待迁移";

  card.append(title, meta, badge);
  return card;
}

function featureGroup(title, items) {
  const group = document.createElement("section");
  group.className = "feature-group";

  const heading = document.createElement("h3");
  heading.textContent = title;

  const list = document.createElement("div");
  list.className = "feature-list";
  items.forEach((item) => list.append(featureCard(item)));

  group.append(heading, list);
  return group;
}

function renderFeatures(features) {
  featureGrid.replaceChildren(
    featureGroup("盘式与模式", features.desktopModes || []),
    featureGroup("主页面与文字页", features.mainTabs || []),
    featureGroup("全文/编辑体验", features.textPages || []),
    featureGroup("已接入桥接层", features.implementedBridge || [])
  );

  guardrailsNode.replaceChildren(
    ...(features.migrationGuards || []).map((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      return li;
    })
  );
}

function formPayload() {
  syncAllDateTimeWidgets();
  const formData = chartValues();
  const mode = formData.mode || "traditional";
  const canvasRect = chartImage.closest(".chart-canvas").getBoundingClientRect();
  const pixelRatio = window.devicePixelRatio || 1;
  const layoutWidth = Math.max(360, Math.round(canvasRect.width));
  const layoutHeight = Math.max(360, Math.round(canvasRect.height));
  return {
    mode,
    entryType: mode === "pick" ? "pick" : "data",
    astroMode: formData.astroMode || "natal",
    name: formData.name,
    sex: formData.sex,
    birthDate: formData.birthDate,
    birthTime: formData.birthTime,
    country: formData.country || "中国",
    city: formData.city || "北京",
    zone: formData.zone || "Asia/Shanghai",
    nowDate: formData.nowDate || formData.birthDate,
    nowTime: formData.nowTime || formData.birthTime,
    showNow: formData.showNow === "on" ? "true" : "false",
    showAspects: formData.showAspects === "on" ? "true" : "false",
    daySet: formData.daySet === "on" ? "true" : "false",
    timeAdjust: formData.timeAdjust || "2",
    mountainPos: formData.mountainPos || "0.0",
    note: formData.note || "",
    imageWidth: String(Math.max(360, Math.round(layoutWidth * pixelRatio))),
    imageHeight: String(Math.max(360, Math.round(layoutHeight * pixelRatio))),
    layoutWidth: String(layoutWidth),
    layoutHeight: String(layoutHeight),
    reservedWidth: "0",
    imageZoom: String(Math.max(100, Math.round(pixelRatio * 100)))
  };
}

async function computePayload(payload) {
  if (!currentTextPages) {
    resultNode.textContent = "正在計算...";
  }
  const chart = await postJson("/api/chart/compute", payload);
  showChartResult(chart);
  console.info("Moira chart computed", compactChartPayload(chart));
  return chart;
}

function scheduleCompute() {
  window.clearTimeout(autoComputeTimer);
  autoComputeTimer = window.setTimeout(() => {
    computePayload(formPayload()).catch((error) => {
      chartImage.hidden = true;
      emptyChart.hidden = false;
      showResult({ request: formPayload(), error: error.message });
    });
  }, 350);
}

function loadEntries() {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveEntries() {
  localStorage.setItem(storageKey, JSON.stringify(entries));
}

function markEntriesDirty() {
  entriesDirty = true;
}

function markEntriesSaved() {
  entriesDirty = false;
}

function entryId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function renderEntries() {
  entryTable.replaceChildren(
    ...entries.map((entry) => {
      const row = document.createElement("tr");
      row.dataset.id = entry.id;
      row.classList.toggle("selected", entry.id === selectedEntryId);
      const fields = [
        entry.name,
        entry.sex === "female" ? "女" : "男",
        formatEntryDateTime(entry.birthDate, entry.birthTime),
        `${entry.city || ""}${entry.country ? `, ${entry.country}` : ""}`.trim(),
        entry.note || ""
      ];
      const checkboxCell = document.createElement("td");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.tabIndex = -1;
      checkbox.checked = entry.id === selectedEntryId;
      checkboxCell.append(checkbox);
      row.append(checkboxCell);

      const radioCell = document.createElement("td");
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "selectedEntry";
      radio.tabIndex = -1;
      radio.checked = entry.id === selectedEntryId;
      radioCell.append(radio);
      row.append(radioCell);

      ["name", "sex", "birth", "place", "note"].forEach((fieldName, index) => {
        const cell = document.createElement("td");
        cell.dataset.field = fieldName;
        cell.textContent = fields[index] || "";
        cell.setAttribute("contenteditable", "plaintext-only");
        cell.setAttribute("role", "textbox");
        cell.tabIndex = 0;
        cell.spellcheck = false;
        row.append(cell);
      });
      return row;
    })
  );
  rowCount.textContent = `${entries.length} 列`;
}

function syncSelectionInTable() {
  entryTable.querySelectorAll("tr[data-id]").forEach((row) => {
    const selected = row.dataset.id === selectedEntryId;
    row.classList.toggle("selected", selected);
    row.querySelectorAll("input").forEach((input) => {
      input.checked = selected;
    });
  });
}

function formatEntryDateTime(dateValue, timeValue) {
  const [year = "2006", month = "04", day = "10"] = (dateValue || "2006-04-10").split("-");
  const [hourRaw = "09", minute = "58"] = (timeValue || "09:58").split(":");
  let hour = boundedNumber(hourRaw, 9, 0, 23);
  const ampm = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${pad2(month)}/${pad2(day)}/${year} ${pad2(hour)}:${pad2(minute)}${ampm}`;
}

function parseBirthCell(value, entry) {
  const cleaned = value.trim();
  const isoMatch = cleaned.match(/(\d{4}-\d{1,2}-\d{1,2})\s+(\d{1,2}:\d{2})/);
  if (isoMatch) {
    const [, date, time] = isoMatch;
    const [year, month, day] = date.split("-");
    entry.birthDate = `${year}-${pad2(month)}-${pad2(day)}`;
    entry.birthTime = time;
    return;
  }
  const desktopMatch = cleaned.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!desktopMatch) {
    return;
  }
  const [, month, day, year, hourRaw, minute, ampmRaw] = desktopMatch;
  let hour = boundedNumber(hourRaw, 9, 1, 12);
  const ampm = (ampmRaw || "AM").toUpperCase();
  if (ampm === "PM" && hour < 12) {
    hour += 12;
  }
  if (ampm === "AM" && hour === 12) {
    hour = 0;
  }
  entry.birthDate = `${year}-${pad2(month)}-${pad2(day)}`;
  entry.birthTime = `${pad2(hour)}:${pad2(minute)}`;
}

function parsePlaceCell(value, entry) {
  const [city, country] = value.split(/[,，]/).map((part) => part.trim());
  if (city) {
    entry.city = city;
  }
  if (country) {
    entry.country = country;
  }
}

function updateEntryFromEditableCell(cell) {
  const row = cell.closest("tr[data-id]");
  const entry = entries.find((item) => item.id === row?.dataset.id);
  if (!entry) {
    return;
  }
  const value = cell.textContent || "";
  if (cell.dataset.field === "name") {
    entry.name = value.trim();
  } else if (cell.dataset.field === "sex") {
    entry.sex = /女|female/i.test(value) ? "female" : "male";
  } else if (cell.dataset.field === "birth") {
    parseBirthCell(value, entry);
  } else if (cell.dataset.field === "place") {
    parsePlaceCell(value, entry);
  } else if (cell.dataset.field === "note") {
    entry.note = value;
  }
  selectedEntryId = entry.id;
  saveEntries();
  markEntriesDirty();
  fillForm(entry);
  syncSelectionInTable();
}

function modeLabel(mode) {
  return {
    traditional: "七政四余",
    pick: "天星择日",
    western: "占星盘",
    sidereal: "郑氏星案"
  }[mode] || mode || "七政四余";
}

function fillForm(entry) {
  ensureOption(chartField("country"), entry.country || "中国");
  ensureOption(chartField("city"), entry.city || "北京");
  ensureOption(chartField("zone"), entry.zone || "Asia/Shanghai");
  setChartValue("mode", entry.mode || "traditional");
  setChartValue("astroMode", entry.astroMode || "natal");
  setChartValue("name", entry.name || "");
  setChartValue("sex", entry.sex || "male");
  setChartValue("birthDate", entry.birthDate || "2006-04-10");
  setChartValue("birthTime", entry.birthTime || "09:58");
  setChartValue("nowDate", entry.nowDate || entry.birthDate || "2026-04-09");
  setChartValue("nowTime", entry.nowTime || entry.birthTime || "12:30");
  setChartValue("country", entry.country || "中国");
  setChartValue("city", entry.city || "北京");
  setChartValue("zone", entry.zone || "Asia/Shanghai");
  setChartValue("showNow", entry.showNow !== false);
  setChartValue("showAspects", entry.showAspects === true);
  setChartValue("daySet", entry.daySet !== false);
  setChartValue("timeAdjust", entry.timeAdjust || "2");
  setChartValue("mountainPos", entry.mountainPos || "0.0");
  setChartValue("note", entry.note || "");
  updateAllDateTimeWidgets();
}

function ensureOption(select, value) {
  if (!select || !value || Array.from(select.options).some((option) => option.value === value)) {
    return;
  }
  const option = document.createElement("option");
  option.value = value;
  option.textContent = value;
  select.append(option);
}

async function refreshStatus() {
  try {
    const [health, version, features] = await Promise.all([
      fetchJson("/health"),
      fetchJson("/api/version"),
      fetchJson("/api/features")
    ]);
    statusNode.textContent = "Ready";
    statusNode.classList.add("ok");
    versionNode.textContent = `${version.name} · API v${version.apiVersion} · ${version.migrationStage}`;
    renderFeatures(features);
    if (!currentTextPages) {
      resultNode.textContent = "等待計算...";
    }
  } catch (error) {
    statusNode.textContent = "Offline";
    statusNode.classList.remove("ok");
    versionNode.textContent = "服務暫不可用";
    showResult({ error: error.message });
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await computePayload(formPayload());
  } catch (error) {
    chartImage.hidden = true;
    emptyChart.hidden = false;
    textTabs.hidden = true;
    showResult({ request: formPayload(), error: error.message });
  }
});

form.addEventListener("change", scheduleCompute);
form.addEventListener("input", scheduleCompute);
chartFields()
  .filter((control) => !form.contains(control))
  .forEach((control) => {
    control.addEventListener("change", scheduleCompute);
    control.addEventListener("input", scheduleCompute);
  });

tabButtons.forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

function closeMenus(exceptMenu = null) {
  document.querySelectorAll(".menu[open]").forEach((menu) => {
    if (menu !== exceptMenu) {
      menu.removeAttribute("open");
    }
  });
}

function runMenuAction(action) {
  const actionMap = {
    open: importMriButton,
    append: importEntriesButton,
    save: exportMriButton,
    "save-as": exportEntriesButton,
    new: saveEntryButton,
    delete: deleteEntryButton,
    update: updateEntryButton
  };
  if (actionMap[action]) {
    actionMap[action].click();
    return;
  }
  if (action === "focus-name") {
    switchView("chart");
    chartField("name")?.focus();
    return;
  }
  if (action === "close-window") {
    attemptCloseWindow();
    return;
  }
  if (action === "select-all") {
    const node = activeTextNode();
    if (node) {
      selectNodeText(node);
    }
    return;
  }
  if (action === "copy") {
    const node = activeTextNode();
    if (node) {
      selectNodeText(node);
      navigator.clipboard?.writeText(node.textContent || "").catch(() => {});
    }
  }
}

async function attemptCloseWindow() {
  if (entriesDirty && window.confirm("数据已更改，储存档案？")) {
    try {
      await exportMri();
    } catch (error) {
      showResult({ error: error.message });
      return;
    }
  }
  window.close();
  if (!window.closed) {
    document.body.classList.add("app-exit-requested");
  }
}

menuCommands.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.viewTarget) {
      switchView(button.dataset.viewTarget);
    }
    if (button.dataset.action) {
      runMenuAction(button.dataset.action);
    }
    closeMenus();
  });
});

menus.forEach((menu) => {
  const summary = menu.querySelector("summary");
  summary.addEventListener("click", (event) => {
    event.preventDefault();
    const shouldOpen = !menu.open;
    closeMenus(menu);
    menu.open = shouldOpen;
  });
  summary.addEventListener("pointerenter", () => {
    if (document.querySelector(".menu[open]") && !menu.open) {
      closeMenus(menu);
      menu.open = true;
    }
  });
});

document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest(".menubar")) {
    closeMenus();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMenus();
  }
});

textTabs.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-page]");
  if (button) {
    showTextPage(button.dataset.page);
  }
});

saveEntryButton.addEventListener("click", () => {
  const payload = formPayload();
  entries = [
    makeEntryFromPayload(payload),
    ...entries
  ];
  selectedEntryId = entries[0].id;
  saveEntries();
  markEntriesDirty();
  renderEntries();
  switchView("manage");
});

function makeEntryFromPayload(payload, id = entryId()) {
  return {
      id,
      mode: payload.mode,
      entryType: payload.entryType,
      astroMode: payload.astroMode,
      name: payload.name,
      sex: payload.sex,
      birthDate: payload.birthDate,
      birthTime: payload.birthTime,
      nowDate: payload.nowDate,
      nowTime: payload.nowTime,
      country: payload.country,
      city: payload.city,
      zone: payload.zone,
      showNow: payload.showNow === "true",
      showAspects: payload.showAspects === "true",
      daySet: payload.daySet === "true",
      timeAdjust: payload.timeAdjust,
      mountainPos: payload.mountainPos,
      note: payload.note
  };
}

exportEntriesButton.addEventListener("click", () => {
  manageView.classList.add("show-import");
  entryImport.value = JSON.stringify(entries, null, 2);
});

importEntriesButton.addEventListener("click", () => {
  manageView.classList.add("show-import");
  const raw = entryImport.value.trim();
  if (!raw) {
    return;
  }
  if (raw && !raw.startsWith("[") && !raw.startsWith("{")) {
    importLegacyEntry(raw);
    return;
  }
  try {
    const imported = JSON.parse(raw || "[]");
    if (!Array.isArray(imported)) {
      throw new Error("JSON 必须是资料数组。");
    }
    entries = imported.map((entry) => ({ ...entry, id: entry.id || entryId() }));
    selectedEntryId = entries[0]?.id || null;
    saveEntries();
    markEntriesDirty();
    renderEntries();
    switchView("manage");
    showResult({ status: "imported", count: entries.length });
  } catch (error) {
    showResult({ error: error.message });
  }
});

async function importLegacyEntry(packedEntry) {
  try {
    const unpacked = await postJson("/api/entries/unpack", { packedEntry });
    const normalized = unpacked.normalized;
    const birthDay = normalized.birthDay || [];
    const nowDay = normalized.nowDay || [];
    const entry = {
      id: entryId(),
      mode: normalized.mode || "traditional",
      entryType: normalized.entryType || "data",
      name: normalized.name,
      sex: normalized.sex,
      birthDate: formatDateParts(birthDay),
      birthTime: formatTimeParts(birthDay),
      nowDate: formatDateParts(nowDay),
      nowTime: formatTimeParts(nowDay),
      country: normalized.country,
      city: normalized.city,
      zone: normalized.zone,
      daySet: normalized.daySet,
      mountainPos: normalized.mountainPos,
      note: normalized.note
    };
    entries = [entry, ...entries];
    selectedEntryId = entry.id;
    saveEntries();
    markEntriesDirty();
    renderEntries();
    fillForm(entry);
    switchView("manage");
    showResult(unpacked);
  } catch (error) {
    showResult({ error: error.message });
  }
}

function formatDateParts(parts) {
  if (parts.length < 3) {
    return "2006-04-10";
  }
  return `${parts[0]}-${String(parts[1]).padStart(2, "0")}-${String(parts[2]).padStart(2, "0")}`;
}

function formatTimeParts(parts) {
  if (parts.length < 5) {
    return "09:58";
  }
  return `${String(parts[3]).padStart(2, "0")}:${String(parts[4]).padStart(2, "0")}`;
}

function entryToPayload(entry) {
  const mode = entry.mode || "traditional";
  return {
    mode,
    entryType: entry.entryType || (mode === "pick" ? "pick" : "data"),
    astroMode: entry.astroMode || "natal",
    name: entry.name || "",
    sex: entry.sex || "male",
    birthDate: entry.birthDate || "2006-04-10",
    birthTime: entry.birthTime || "09:58",
    nowDate: entry.nowDate || entry.birthDate || "2006-04-10",
    nowTime: entry.nowTime || entry.birthTime || "09:58",
    country: entry.country || "中国",
    city: entry.city || "北京",
    zone: entry.zone || "Asia/Shanghai",
    showNow: entry.showNow === false ? "false" : "true",
    showAspects: entry.showAspects === true ? "true" : "false",
    daySet: entry.daySet === false ? "false" : "true",
    timeAdjust: entry.timeAdjust || "2",
    mountainPos: entry.mountainPos || "0.0",
    note: entry.note || ""
  };
}

async function packedEntryBase64(entry) {
  const packed = await postJson("/api/entries/pack", entryToPayload(entry));
  return utf8ToBase64(packed.packedEntry);
}

async function exportMri() {
  const dataEntries = [];
  const pickEntries = [];
  for (const entry of entries) {
    const packed = await packedEntryBase64(entry);
    if ((entry.entryType || entry.mode) === "pick") {
      pickEntries.push(packed);
    } else {
      dataEntries.push(packed);
    }
  }
  const exported = await postJson("/api/datasets/export", {
    dataEntries: dataEntries.join("|"),
    pickEntries: pickEntries.join("|"),
    footer: "Moira Web",
    fileName: "moira-web.mri"
  });
  entryImport.value = exported.mriBase64;
  downloadBase64(exported.mriBase64, exported.fileName || "moira-web.mri");
  showResult({
    status: exported.status,
    dataCount: exported.dataCount,
    pickCount: exported.pickCount,
    byteLength: exported.byteLength,
    fileName: exported.fileName
  });
  markEntriesSaved();
}

async function importMriBase64(mriBase64) {
  const imported = await postJson("/api/datasets/import", { mriBase64 });
  const importedEntries = [
    ...(imported.dataEntries || []),
    ...(imported.pickEntries || [])
  ].map(normalizedToEntry);
  entries = [...importedEntries, ...entries];
  selectedEntryId = entries[0]?.id || null;
  saveEntries();
  markEntriesDirty();
  renderEntries();
  switchView("manage");
  showResult({
    status: imported.status,
    dataCount: imported.dataCount,
    pickCount: imported.pickCount,
    imported: importedEntries.length
  });
}

function normalizedToEntry(entry) {
  return {
    id: entryId(),
    mode: entry.mode || (entry.entryType === "pick" ? "pick" : "traditional"),
    entryType: entry.entryType || "data",
    name: entry.name || "",
    sex: entry.sex || "male",
    birthDate: entry.birthDate || formatDateParts(entry.birthDay || []),
    birthTime: entry.birthTime || formatTimeParts(entry.birthDay || []),
    nowDate: entry.nowDate || formatDateParts(entry.nowDay || []),
    nowTime: entry.nowTime || formatTimeParts(entry.nowDay || []),
    country: entry.country || "中国",
    city: entry.city || "北京",
    zone: entry.zone || "Asia/Shanghai",
    daySet: entry.daySet !== false,
    mountainPos: entry.mountainPos || "0.0",
    note: entry.note || "",
    packedEntry: entry.packedEntry
  };
}

function utf8ToBase64(value) {
  return bytesToBase64(new TextEncoder().encode(value));
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function downloadBase64(value, fileName) {
  const blob = new Blob([base64ToBytes(value)], {
    type: "application/octet-stream"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

packEntryButton.addEventListener("click", async () => {
  try {
    const packed = await postJson("/api/entries/pack", formPayload());
    entryImport.value = packed.packedEntry;
    showResult(packed);
  } catch (error) {
    showResult({ request: formPayload(), error: error.message });
  }
});

exportMriButton.addEventListener("click", async () => {
  try {
    await exportMri();
  } catch (error) {
    showResult({ error: error.message });
  }
});

importMriButton.addEventListener("click", async () => {
  manageView.classList.add("show-import");
  const pasted = entryImport.value.trim();
  if (pasted && /^[A-Za-z0-9+/=]+$/.test(pasted)) {
    try {
      await importMriBase64(pasted);
    } catch (error) {
      showResult({ error: error.message });
    }
    return;
  }
  mriFileInput.click();
});

mriFileInput.addEventListener("change", async () => {
  const file = mriFileInput.files && mriFileInput.files[0];
  if (!file) {
    return;
  }
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await importMriBase64(bytesToBase64(bytes));
  } catch (error) {
    showResult({ error: error.message });
  } finally {
    mriFileInput.value = "";
  }
});

deleteEntryButton.addEventListener("click", () => {
  if (!selectedEntryId) {
    return;
  }
  entries = entries.filter((item) => item.id !== selectedEntryId);
  selectedEntryId = entries[0]?.id || null;
  saveEntries();
  markEntriesDirty();
  renderEntries();
});

updateEntryButton.addEventListener("click", () => {
  if (!selectedEntryId) {
    return;
  }
  const payload = formPayload();
  entries = entries.map((entry) => entry.id === selectedEntryId
    ? makeEntryFromPayload(payload, selectedEntryId)
    : entry);
  saveEntries();
  markEntriesDirty();
  renderEntries();
});

entryTable.addEventListener("click", (event) => {
  const row = event.target.closest("tr[data-id]");
  if (!row) {
    return;
  }
  const entry = entries.find((item) => item.id === row.dataset.id);
  if (!entry) {
    return;
  }
  const editableCell = event.target.closest("td[data-field]");
  selectedEntryId = entry.id;
  fillForm(entry);
  if (editableCell) {
    syncSelectionInTable();
  } else {
    renderEntries();
  }
});

entryTable.addEventListener("dblclick", async (event) => {
  if (event.target.closest("td[data-field]")) {
    return;
  }
  const row = event.target.closest("tr[data-id]");
  if (!row) {
    return;
  }
  const entry = entries.find((item) => item.id === row.dataset.id);
  if (!entry) {
    return;
  }
  selectedEntryId = entry.id;
  fillForm(entry);
  renderEntries();
  switchView("chart");
  await computePayload(formPayload());
});

entryTable.addEventListener("input", (event) => {
  const cell = event.target.closest("td[data-field]");
  if (!cell) {
    return;
  }
  updateEntryFromEditableCell(cell);
});

entryTable.addEventListener("blur", (event) => {
  const cell = event.target.closest("td[data-field]");
  if (!cell) {
    return;
  }
  updateEntryFromEditableCell(cell);
  renderEntries();
}, true);

window.addEventListener("beforeunload", (event) => {
  if (!entriesDirty) {
    return;
  }
  event.preventDefault();
  event.returnValue = "数据已更改，储存档案？";
});

document.addEventListener("keydown", (event) => {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "a") {
    return;
  }
  const target = event.target;
  if (target.closest?.("input, textarea, select, [contenteditable]")) {
    return;
  }
  const node = activeTextNode();
  if (!node) {
    return;
  }
  event.preventDefault();
  selectNodeText(node);
});

renderEntries();
populateMonthSelects();
wireDateTimeWidgets();
initializeCurrentDateTimes();
updateAllDateTimeWidgets();
switchView("chart");
refreshStatus();
computePayload(formPayload()).catch((error) => {
  chartImage.hidden = true;
  emptyChart.hidden = false;
  showResult({ request: formPayload(), error: error.message });
});
