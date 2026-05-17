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
const menuCascades = [...document.querySelectorAll(".menu-cascade")];
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
const textImportFile = document.querySelector("#textImportFile");
const optionDialog = document.querySelector("#optionDialog");
const optionDialogTitle = document.querySelector("#optionDialogTitle");
const optionDialogBody = document.querySelector("#optionDialogBody");
const optionDialogOk = document.querySelector("#optionDialogOk");
const storageKey = "moira-web.entries";
const settingsKey = "moira-web.settings";
let currentTextPages = null;
let entries = loadEntries();
let autoComputeTimer = null;
let selectedEntryId = entries[0]?.id || null;
let entriesDirty = false;
let pendingTextImport = null;
let settings;
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
const defaultSettings = {
  toolbarFile: true,
  toolbarEdit: true,
  toolbarOptions: true,
  toolbarSearch: true,
  monochrome: false,
  minimizeToTray: false,
  highResolutionUi: false,
  simplifiedLabels: false,
  printNotes: false,
  chartWidth: 0,
  chartHeight: 0,
  fontDirection: "horizontal",
  interfaceFont: "Lucida Grande",
  themeColor: "#30302f",
  selectedPlanets: ["日", "月", "水", "金", "火", "木", "土"],
  selectedAspects: ["合", "刑", "沖", "拱", "半合"],
  houseSystem: "Placidus",
  zodiacMode: "tropical",
  searchMethod: "transit"
};
settings = loadSettings();

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

function loadSettings() {
  try {
    const raw = localStorage.getItem(settingsKey);
    return { ...defaultSettings, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...defaultSettings };
  }
}

function saveSettings() {
  localStorage.setItem(settingsKey, JSON.stringify(settings));
}

function notify(message, detail = "") {
  showResult({
    status: "ok",
    message,
    detail
  });
}

function applySettings() {
  document.body.classList.toggle("monochrome-chart", Boolean(settings.monochrome));
  document.body.classList.toggle("high-resolution-ui", Boolean(settings.highResolutionUi));
  document.body.classList.toggle("simplified-labels", Boolean(settings.simplifiedLabels));
  document.querySelectorAll("[data-pref]").forEach((input) => {
    input.checked = Boolean(settings[input.dataset.pref]);
  });
  if (settings.themeColor) {
    document.documentElement.style.setProperty("--chrome", settings.themeColor);
  }
}

function updateSetting(name, value) {
  settings = { ...settings, [name]: value };
  saveSettings();
  applySettings();
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

function selectedEditableElement() {
  const active = document.activeElement;
  if (active?.matches?.("input, textarea, [contenteditable='plaintext-only'], [contenteditable='true']")) {
    return active;
  }
  return activeTextNode();
}

async function clipboardWrite(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  }
}

async function clipboardRead() {
  if (navigator.clipboard?.readText) {
    return navigator.clipboard.readText();
  }
  return "";
}

function replaceEditableSelection(text) {
  const target = selectedEditableElement();
  if (!target) {
    return;
  }
  if (target.matches?.("input, textarea")) {
    const start = target.selectionStart ?? target.value.length;
    const end = target.selectionEnd ?? start;
    target.setRangeText(text, start, end, "end");
    target.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  if (target.isContentEditable) {
    document.execCommand("insertText", false, text);
  }
}

function deleteEditableSelection() {
  replaceEditableSelection("");
}

function openBasicDialog(title, bodyBuilder, onOk = null) {
  optionDialogTitle.textContent = title;
  optionDialogBody.replaceChildren();
  if (typeof bodyBuilder === "string") {
    const paragraph = document.createElement("p");
    paragraph.textContent = bodyBuilder;
    optionDialogBody.append(paragraph);
  } else {
    optionDialogBody.append(bodyBuilder);
  }
  optionDialogOk.onclick = () => {
    if (onOk) {
      onOk();
    }
  };
  if (typeof optionDialog.showModal === "function") {
    optionDialog.showModal();
  } else {
    alert(`${title}\n\n${optionDialogBody.textContent}`);
  }
}

function dialogField(labelText, input) {
  const label = document.createElement("label");
  const span = document.createElement("span");
  span.textContent = labelText;
  label.append(span, input);
  return label;
}

function textInput(value = "", type = "text") {
  const input = document.createElement("input");
  input.type = type;
  input.value = value;
  return input;
}

function numberInput(value, min, max) {
  const input = textInput(String(value), "number");
  input.min = String(min);
  input.max = String(max);
  return input;
}

function checkboxInput(checked) {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(checked);
  return input;
}

function selectInput(value, options) {
  const select = document.createElement("select");
  options.forEach(([optionValue, label]) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = label;
    select.append(option);
  });
  select.value = value;
  return select;
}

function checkGrid(title, values, choices, onOk) {
  const fieldset = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = title;
  const grid = document.createElement("div");
  grid.className = "check-grid";
  const inputs = choices.map((choice) => {
    const input = checkboxInput(values.includes(choice));
    const label = document.createElement("label");
    label.append(input, choice);
    grid.append(label);
    return [choice, input];
  });
  fieldset.append(legend, grid);
  return [fieldset, () => onOk(inputs.filter(([, input]) => input.checked).map(([choice]) => choice))];
}

function openStoredChecklist(title, settingName, choices, note) {
  const container = document.createElement("div");
  const [grid, collect] = checkGrid(title, settings[settingName] || [], choices, (values) => {
    updateSetting(settingName, values);
    notify(`${title}已保存`, values.join("、"));
    scheduleCompute();
  });
  const paragraph = document.createElement("p");
  paragraph.className = "dialog-note";
  paragraph.textContent = note || "这些选项会先保存在浏览器端；已经有后端参数的项目会立即参与重新计算。";
  container.append(grid, paragraph);
  openBasicDialog(title, container, collect);
}

function openTextInfo(title, message) {
  const container = document.createElement("div");
  const paragraph = document.createElement("p");
  paragraph.textContent = message;
  const note = document.createElement("p");
  note.className = "dialog-note";
  note.textContent = "此入口已可点击，并会保存相关 Web 状态；需要 legacy 后端专门算法的部分会继续逐项接入。";
  container.append(paragraph, note);
  openBasicDialog(title, container);
}

function downloadChartImage() {
  if (!chartImage.src || chartImage.hidden) {
    notify("尚未生成圖形", "請先計算星盤。");
    return;
  }
  const link = document.createElement("a");
  link.href = chartImage.src;
  link.download = `moira-chart-${Date.now()}.png`;
  document.body.append(link);
  link.click();
  link.remove();
}

function openImageSizeDialog() {
  const container = document.createElement("div");
  const width = numberInput(settings.chartWidth || "", 0, 5000);
  const height = numberInput(settings.chartHeight || "", 0, 5000);
  container.append(
    dialogField("圖形寬度", width),
    dialogField("圖形高度", height),
    Object.assign(document.createElement("p"), {
      className: "dialog-note",
      textContent: "這會影響下一次圖形輸出的目標尺寸；頁面仍會依視窗大小顯示。"
    })
  );
  openBasicDialog("圖形面積設定", container, () => {
    settings.chartWidth = boundedNumber(width.value, 0, 0, 5000);
    settings.chartHeight = boundedNumber(height.value, 0, 0, 5000);
    saveSettings();
    scheduleCompute();
  });
}

function buttonTitle(action) {
  return {
    "edit-life-palace": "修改命宮",
    "edit-star-position": "修改星曜位置",
    "life-body-settings": "立命安身",
    "pick-settings": "選擇擇日計算",
    "angle-settings": "選擇角距顯示",
    "aspect-settings": "選擇相位",
    "strength-settings": "選擇星曜及強勢角距",
    "synastry-settings": "選擇合盤計算",
    "spirit-settings": "選擇神煞",
    "pattern-settings": "選擇政餘格局"
  }[action] || action;
}

function openSelectSetting(title, settingName, options) {
  const container = document.createElement("div");
  const select = selectInput(settings[settingName], options);
  container.append(
    dialogField(title, select),
    Object.assign(document.createElement("p"), {
      className: "dialog-note",
      textContent: "此設定會保存在目前瀏覽器，並在後續可用的計算橋接中沿用。"
    })
  );
  openBasicDialog(title, container, () => {
    updateSetting(settingName, select.value);
    notify(`${title}已保存`, select.options[select.selectedIndex]?.textContent || select.value);
    scheduleCompute();
  });
}

function openFontDialog() {
  const container = document.createElement("div");
  const font = selectInput(settings.interfaceFont, [
    ["Lucida Grande", "Lucida Grande"],
    ["Helvetica Neue", "Helvetica Neue"],
    ["PingFang TC", "PingFang TC"],
    ["AR PL UKai TW", "AR PL UKai TW"],
    ["Noto Sans CJK TC", "Noto Sans CJK TC"]
  ]);
  container.append(
    dialogField("介面字形", font),
    Object.assign(document.createElement("p"), {
      className: "dialog-note",
      textContent: "伺服器盤面字形由 Docker runtime 提供；這裡調整瀏覽器介面字形偏好。"
    })
  );
  openBasicDialog("字形設定", container, () => {
    updateSetting("interfaceFont", font.value);
    document.body.style.fontFamily = `"${font.value}", "Helvetica Neue", Arial, sans-serif`;
    notify("字形設定已保存", font.value);
  });
}

function openColorDialog() {
  const container = document.createElement("div");
  const color = textInput(settings.themeColor, "color");
  const monochrome = checkboxInput(settings.monochrome);
  container.append(
    dialogField("工具列顏色", color),
    dialogField("黑白色", monochrome)
  );
  openBasicDialog("色彩設定", container, () => {
    settings.themeColor = color.value;
    settings.monochrome = monochrome.checked;
    saveSettings();
    applySettings();
    notify("色彩設定已保存", color.value);
  });
}

function openLunarConverterDialog() {
  const container = document.createElement("div");
  const date = textInput(chartField("birthDate")?.value || "2006-04-10", "date");
  const result = document.createElement("p");
  result.className = "dialog-note";
  result.textContent = "Web 版目前以伺服器計算結果中的陰曆資訊為準；選擇日期後按 OK 會同步到出生日期並重新計算。";
  container.append(dialogField("日期", date), result);
  openBasicDialog("陰曆轉換", container, () => {
    setChartValue("birthDate", date.value);
    updateAllDateTimeWidgets();
    scheduleCompute();
  });
}

function openSearchDialog(action) {
  const title = {
    "search-transit": "流年星法",
    "search-primary": "主限法",
    "search-secondary": "次限法",
    "search-solar-arc": "太陽弧角法",
    "search-sun-mountain": "動盤太陽到山時間",
    "search-eight-time": "八字時間",
    "search-solar-eclipse": "日蝕時間",
    "search-lunar-eclipse": "月蝕時間",
    "search-aspect": "相位"
  }[action] || "搜索";
  const container = document.createElement("div");
  const start = textInput(chartField("nowDate")?.value || chartField("birthDate")?.value || "2026-01-01", "date");
  const years = numberInput(1, 1, 120);
  container.append(
    dialogField("起始日期", start),
    dialogField("搜尋年數", years),
    Object.assign(document.createElement("p"), {
      className: "dialog-note",
      textContent: "目前會把搜尋條件保存並切到計算頁顯示當前盤資料；專門事件列表會隨 legacy 搜尋算法逐項接入。"
    })
  );
  openBasicDialog(title, container, () => {
    settings.searchMethod = action;
    settings.searchStart = start.value;
    settings.searchYears = boundedNumber(years.value, 1, 1, 120);
    saveSettings();
    switchView("calculation");
    computePayload(formPayload()).catch((error) => showResult({ error: error.message }));
  });
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
  const controlRect = document.querySelector(".control-panel")?.getBoundingClientRect();
  const pixelRatio = window.devicePixelRatio || 1;
  const layoutWidth = Math.max(360, Math.round(canvasRect.width));
  const layoutHeight = Math.max(360, Math.round(canvasRect.height));
  const reservedWidth = controlRect
    ? Math.min(Math.max(0, Math.round(controlRect.width + 34)), Math.max(0, layoutWidth - 480))
    : 0;
  const autoWidth = Math.max(360, Math.round(layoutWidth * pixelRatio));
  const autoHeight = Math.max(360, Math.round(layoutHeight * pixelRatio));
  const requestedWidth = boundedNumber(settings.chartWidth, 0, 0, 5000);
  const requestedHeight = boundedNumber(settings.chartHeight, 0, 0, 5000);
  const outputWidth = Math.max(autoWidth, requestedWidth);
  const outputHeight = Math.max(autoHeight, requestedHeight);
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
    showGauquelin: formData.showGauquelin === "on" ? "true" : "false",
    showFixstar: formData.showFixstar === "on" ? "true" : "false",
    showHoriz: formData.showHoriz === "on" ? "true" : "false",
    singleWheel: formData.singleWheel === "on" ? "true" : "false",
    showMansions: formData.showMansions === "on" ? "true" : "false",
    showAnnotations: formData.showAnnotations === "on" ? "true" : "false",
    daySet: formData.daySet === "off" ? "false" : "true",
    timeAdjust: formData.timeAdjust || "2",
    mountainPos: formData.mountainPos || "0.0",
    note: formData.note || "",
    imageWidth: String(Math.max(360, Math.round(outputWidth))),
    imageHeight: String(Math.max(360, Math.round(outputHeight))),
    layoutWidth: String(layoutWidth),
    layoutHeight: String(layoutHeight),
    reservedWidth: String(reservedWidth),
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
  syncMenuCheckmarks();
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
  setChartValue("showGauquelin", entry.showGauquelin === true);
  setChartValue("showFixstar", entry.showFixstar === true);
  setChartValue("showHoriz", entry.showHoriz === true);
  setChartValue("singleWheel", entry.singleWheel === true);
  setChartValue("showMansions", entry.showMansions === true);
  setChartValue("showAnnotations", entry.showAnnotations === true);
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

document.querySelectorAll("[data-pref]").forEach((input) => {
  input.addEventListener("change", () => {
    updateSetting(input.dataset.pref, input.checked);
    notify("選項已更新", input.closest("label")?.textContent.trim() || input.dataset.pref);
  });
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
  menuCascades.forEach((cascade) => {
    if (!exceptMenu || !exceptMenu.contains(cascade)) {
      cascade.removeAttribute("open");
    }
  });
}

function closeMenuCascades(exceptCascade = null) {
  menuCascades.forEach((cascade) => {
    if (cascade !== exceptCascade) {
      cascade.removeAttribute("open");
    }
  });
}

function positionMenuCascade(cascade) {
  const summary = cascade.querySelector("summary");
  const panel = cascade.querySelector(".menu-subpanel");
  if (!summary || !panel) {
    return;
  }
  const rect = summary.getBoundingClientRect();
  const width = panel.offsetWidth || 190;
  const height = panel.offsetHeight || 120;
  let left = rect.right - 2;
  let top = rect.top - 1;
  if (left + width > window.innerWidth - 4) {
    left = Math.max(4, rect.left - width + 2);
  }
  if (top + height > window.innerHeight - 4) {
    top = Math.max(4, window.innerHeight - height - 4);
  }
  panel.style.setProperty("--submenu-left", `${Math.round(left)}px`);
  panel.style.setProperty("--submenu-top", `${Math.round(top)}px`);
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
  if (action === "print") {
    window.print();
    return;
  }
  if (action === "print-notes") {
    document.body.classList.add("print-with-notes");
    window.print();
    window.setTimeout(() => document.body.classList.remove("print-with-notes"), 500);
    return;
  }
  if (action === "save-image") {
    downloadChartImage();
    return;
  }
  if (action === "image-size") {
    openImageSizeDialog();
    return;
  }
  if (action === "save-settings") {
    saveSettings();
    notify("設定已保存", "Web 版會把選項保存在目前瀏覽器。");
    return;
  }
  if (action === "set-current-time") {
    initializeCurrentDateTimes();
    updateAllDateTimeWidgets();
    scheduleCompute();
    return;
  }
  if (action === "close-window") {
    attemptCloseWindow();
    return;
  }
  if (action === "open-modification" || action === "open-evaluation") {
    pendingTextImport = action;
    textImportFile.click();
    return;
  }
  if (action === "restore-modification") {
    setChartValue("note", "");
    notify("修改已還原", "已清空目前資料的修改/備註內容。");
    scheduleCompute();
    return;
  }
  if (action === "restore-evaluation") {
    noteTextNode.textContent = currentTextPages?.notes || "尚未生成批注資料。";
    notify("解盤已還原", "已還原為目前計算結果的批注文字。");
    return;
  }
  if (action === "refresh-evaluation") {
    computePayload(formPayload()).then(() => switchView("notes")).catch((error) => showResult({ error: error.message }));
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
    return;
  }
  if (action === "cut") {
    const target = selectedEditableElement();
    if (target?.matches?.("input, textarea")) {
      const text = target.value.slice(target.selectionStart || 0, target.selectionEnd || 0);
      clipboardWrite(text).catch(() => {});
      deleteEditableSelection();
    } else {
      document.execCommand("cut");
    }
    return;
  }
  if (action === "paste") {
    clipboardRead().then(replaceEditableSelection).catch(() => {
      openTextInfo("貼上", "瀏覽器沒有授權讀取剪貼簿，請使用 Cmd+V。");
    });
    return;
  }
  if (action === "delete-selection") {
    deleteEditableSelection();
    return;
  }
  if (action === "undo" || action === "redo" || action === "bold") {
    document.execCommand(action === "redo" ? "redo" : action);
    return;
  }
  if (action === "highlight") {
    document.execCommand("backColor", false, "#fff59d");
    return;
  }
  if (action === "lunar-converter") {
    openLunarConverterDialog();
    return;
  }
  if (action === "edit-life-palace" || action === "edit-star-position" || action === "life-body-settings" || action === "pick-settings") {
    openTextInfo(buttonTitle(action), "這個桌面功能在 Web 版先作為可操作入口保留；目前會使用表單中的時間、地點與山向重新計算。");
    return;
  }
  if (action === "planet-settings") {
    openStoredChecklist("選擇星曜", "selectedPlanets", ["日", "月", "水", "金", "火", "木", "土", "天", "海", "冥", "計", "孛", "福", "升", "頂"]);
    return;
  }
  if (action === "aspect-settings" || action === "angle-settings" || action === "strength-settings") {
    openStoredChecklist(buttonTitle(action), "selectedAspects", ["合", "半合", "刑", "拱", "沖", "六合", "十二分", "八分"]);
    return;
  }
  if (action === "house-settings") {
    openSelectSetting("選擇分宮制", "houseSystem", [["Placidus", "Placidus"], ["Koch", "Koch"], ["Equal", "Equal"], ["Whole Sign", "Whole Sign"]]);
    return;
  }
  if (action === "zodiac-settings") {
    openSelectSetting("選擇回歸恆星制", "zodiacMode", [["tropical", "回歸制"], ["sidereal", "恆星制"]]);
    return;
  }
  if (action === "synastry-settings" || action === "spirit-settings" || action === "pattern-settings") {
    openTextInfo(buttonTitle(action), "相關選項已可進入設定流程；完整細項會保存在瀏覽器端，等待對應 legacy 規則逐項接入。");
    return;
  }
  if (action === "font-direction") {
    openSelectSetting("字形方向設定", "fontDirection", [["horizontal", "橫排"], ["vertical", "直排"]]);
    return;
  }
  if (action === "font-settings") {
    openFontDialog();
    return;
  }
  if (action === "color-settings") {
    openColorDialog();
    return;
  }
  if (action === "toggle-language") {
    updateSetting("simplifiedLabels", !settings.simplifiedLabels);
    notify("語言選項已保存", settings.simplifiedLabels ? "偏好：简体中文" : "偏好：繁體中文");
    return;
  }
  if (action === "reset-options") {
    settings = { ...defaultSettings };
    saveSettings();
    applySettings();
    notify("選項已還原", "已還原 Web 版預設選項。");
    scheduleCompute();
    return;
  }
  if (action.startsWith("search-")) {
    openSearchDialog(action);
  }
}

function syncMenuCheckmarks() {
  document.querySelectorAll("[data-check-group]").forEach((button) => {
    const control = chartField(button.dataset.checkGroup);
    const value = control?.value;
    const label = button.dataset.label || button.textContent.replace(/^✓\s*/, "");
    button.dataset.label = label;
    button.textContent = value === button.dataset.setValue ? `✓ ${label}` : label;
  });
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
    if (button.dataset.setControl) {
      setChartValue(button.dataset.setControl, button.dataset.setValue);
      chartField(button.dataset.setControl)?.dispatchEvent(new Event("change", { bubbles: true }));
      syncMenuCheckmarks();
    }
    if (button.dataset.viewTarget) {
      switchView(button.dataset.viewTarget);
    }
    if (button.dataset.action) {
      runMenuAction(button.dataset.action);
    }
    closeMenus();
  });
});

syncMenuCheckmarks();

menus.forEach((menu) => {
  const summary = menu.querySelector("summary");
  summary.addEventListener("click", (event) => {
    event.preventDefault();
    const shouldOpen = !menu.open;
    closeMenus(menu);
    menu.open = shouldOpen;
    if (!shouldOpen) {
      closeMenuCascades();
    }
  });
  summary.addEventListener("pointerenter", () => {
    if (document.querySelector(".menu[open]") && !menu.open) {
      closeMenus(menu);
      menu.open = true;
    }
  });
});

menuCascades.forEach((cascade) => {
  const summary = cascade.querySelector("summary");
  summary.addEventListener("click", (event) => {
    event.preventDefault();
    const shouldOpen = !cascade.open;
    closeMenuCascades(cascade);
    cascade.open = shouldOpen;
    if (shouldOpen) {
      positionMenuCascade(cascade);
    }
  });
  summary.addEventListener("pointerenter", () => {
    closeMenuCascades(cascade);
    cascade.open = true;
    positionMenuCascade(cascade);
  });
  cascade.addEventListener("focusin", () => {
    positionMenuCascade(cascade);
  });
});

window.addEventListener("resize", () => {
  menuCascades.filter((cascade) => cascade.open).forEach(positionMenuCascade);
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
      showGauquelin: payload.showGauquelin === "true",
      showFixstar: payload.showFixstar === "true",
      showHoriz: payload.showHoriz === "true",
      singleWheel: payload.singleWheel === "true",
      showMansions: payload.showMansions === "true",
      showAnnotations: payload.showAnnotations === "true",
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
    showGauquelin: entry.showGauquelin === true ? "true" : "false",
    showFixstar: entry.showFixstar === true ? "true" : "false",
    showHoriz: entry.showHoriz === true ? "true" : "false",
    singleWheel: entry.singleWheel === true ? "true" : "false",
    showMansions: entry.showMansions === true ? "true" : "false",
    showAnnotations: entry.showAnnotations === true ? "true" : "false",
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
    showGauquelin: entry.showGauquelin === true,
    showFixstar: entry.showFixstar === true,
    showHoriz: entry.showHoriz === true,
    singleWheel: entry.singleWheel === true,
    showMansions: entry.showMansions === true,
    showAnnotations: entry.showAnnotations === true,
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

textImportFile.addEventListener("change", async () => {
  const file = textImportFile.files && textImportFile.files[0];
  if (!file) {
    return;
  }
  try {
    const text = await file.text();
    if (pendingTextImport === "open-modification") {
      setChartValue("note", text);
      notify("修改檔案已載入", file.name);
      scheduleCompute();
    } else {
      noteTextNode.textContent = text;
      switchView("notes");
      notify("解盤檔案已載入", file.name);
    }
  } catch (error) {
    showResult({ error: error.message });
  } finally {
    pendingTextImport = null;
    textImportFile.value = "";
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

applySettings();
if (settings.interfaceFont) {
  document.body.style.fontFamily = `"${settings.interfaceFont}", "Helvetica Neue", Arial, sans-serif`;
}
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
