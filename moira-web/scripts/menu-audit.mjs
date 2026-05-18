#!/usr/bin/env node

import { chromium, firefox, webkit } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:8080";
const browserName = process.env.MOIRA_WEB_BROWSER || "chromium";
const browserType = { chromium, firefox, webkit }[browserName];

if (!browserType) {
  throw new Error(`Unsupported MOIRA_WEB_BROWSER=${browserName}`);
}

const MENU = {
  moira: 1,
  file: 2,
  edit: 3,
  options: 4,
  search: 5,
  view: 6,
  help: 7
};

const SEARCH_ACTIONS = [
  ["search-transit", "流年星法"],
  ["search-primary", "主限法"],
  ["search-secondary", "次限法"],
  ["search-solar-arc", "太陽弧角法"],
  ["search-sun-mountain", "動盤太陽到山時間"],
  ["search-eight-time", "八字時間"],
  ["search-solar-eclipse", "日蝕時間"],
  ["search-lunar-eclipse", "月蝕時間"],
  ["search-aspect", "相位"]
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function checked(locator) {
  return locator.evaluate((input) => input.checked);
}

async function inputValue(page, name) {
  return page.locator(`[name="${name}"]`).inputValue();
}

async function localSettings(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("moira-web.settings") || "{}"));
}

async function openMenu(page, menuNumber) {
  const menu = page.locator(`details.menu:nth-of-type(${menuNumber})`);
  if (!(await menu.evaluate((node) => node.open))) {
    await menu.locator(":scope > summary").click();
  }
}

async function clickMenuAction(page, menuNumber, action, visitedActions) {
  await openMenu(page, menuNumber);
  const command = page.locator(`details.menu:nth-of-type(${menuNumber}) > .menu-panel [data-action="${action}"]`).first();
  assert(await command.count() === 1, `Missing menu action ${action}`);
  await command.click();
  visitedActions.add(action);
}

async function clickViewTarget(page, menuNumber, view, visitedViews) {
  await openMenu(page, menuNumber);
  const command = page.locator(`details.menu:nth-of-type(${menuNumber}) > .menu-panel [data-view-target="${view}"]`).first();
  assert(await command.count() === 1, `Missing view target ${view}`);
  await command.click();
  visitedViews.add(view);
  await page.locator(`.app-window[data-current-view="${view}"]`).waitFor({ state: "attached", timeout: 5000 });
}

async function openOptionsCascade(page, cascadeIndex) {
  await openMenu(page, MENU.options);
  const cascade = page.locator("details.menu:nth-of-type(4) details.menu-cascade").nth(cascadeIndex);
  await cascade.locator("summary").hover();
  await page.locator("details.menu:nth-of-type(4) .menu-subpanel:visible").waitFor({ state: "visible", timeout: 5000 });
}

async function clickSetControl(page, cascadeIndex, control, value, visitedControls) {
  await openOptionsCascade(page, cascadeIndex);
  const command = page.locator(`details.menu:nth-of-type(4) .menu-subpanel:visible [data-set-control="${control}"][data-set-value="${value}"]`);
  assert(await command.count() === 1, `Missing ${control}=${value}`);
  const requestPromise = waitForCompute(page, (payload) => payload[control] === value, 30000, `${control}=${value}`);
  await command.click();
  visitedControls.add(`${control}=${value}`);
  assert(await inputValue(page, control) === value, `${control} did not change to ${value}`);
  await requestPromise;
}

async function toggleFormCheckbox(page, name, visitedFormOptions, computePayloads) {
  console.log(`Auditing form option ${name}`);
  await openMenu(page, MENU.options);
  const checkbox = page.locator(`details.menu:nth-of-type(4) input[name="${name}"]`);
  assert(await checkbox.count() === 1, `Missing form checkbox ${name}`);
  const before = await checked(checkbox);
  const requestPromise = waitForCompute(page, (payload) => payload[name] === String(!before));
  await checkbox.setChecked(!before, { force: true });
  visitedFormOptions.add(name);
  await requestPromise;
  assert(computePayloads.some((payload) => payload[name] === String(!before)), `${name} was not sent to backend`);
}

async function toggleTabPanel(page, panel, visitedTabPanels) {
  await openOptionsCascade(page, 2);
  const checkbox = page.locator(`details.menu:nth-of-type(4) .menu-subpanel:visible [data-tab-panel="${panel}"]`);
  assert(await checkbox.count() === 1, `Missing tab panel toggle ${panel}`);
  await checkbox.click();
  visitedTabPanels.add(panel);
  assert(await page.locator(`.main-tabs .tab[data-view="${panel}"]`).isHidden(), `${panel} tab did not hide`);
  await openOptionsCascade(page, 2);
  await page.locator(`details.menu:nth-of-type(4) .menu-subpanel:visible [data-tab-panel="${panel}"]`).click();
  assert(await page.locator(`.main-tabs .tab[data-view="${panel}"]`).isVisible(), `${panel} tab did not restore`);
}

async function toggleToolbar(page, pref, visibleSelector, visitedPrefs) {
  await clickViewTarget(page, MENU.view, "manage", new Set());
  await openOptionsCascade(page, 3);
  const checkbox = page.locator(`details.menu:nth-of-type(4) .menu-subpanel:visible [data-pref="${pref}"]`);
  assert(await checkbox.count() === 1, `Missing toolbar pref ${pref}`);
  await checkbox.click();
  visitedPrefs.add(pref);
  assert(await page.locator(visibleSelector).first().isHidden(), `${pref} did not hide ${visibleSelector}`);
  await openOptionsCascade(page, 3);
  await page.locator(`details.menu:nth-of-type(4) .menu-subpanel:visible [data-pref="${pref}"]`).click();
  assert(await page.locator(visibleSelector).first().isVisible(), `${pref} did not restore ${visibleSelector}`);
}

async function togglePref(page, pref, visitedPrefs, afterToggle = null) {
  await openMenu(page, MENU.options);
  const checkbox = page.locator(`details.menu:nth-of-type(4) [data-pref="${pref}"]`);
  assert(await checkbox.count() === 1, `Missing pref ${pref}`);
  const before = await checked(checkbox);
  await checkbox.click();
  visitedPrefs.add(pref);
  const settings = await localSettings(page);
  assert(settings[pref] === !before, `${pref} was not persisted`);
  if (afterToggle) {
    await afterToggle(!before);
  }
}

async function toggleViewPref(page, pref, visitedPrefs, afterToggle = null) {
  await openMenu(page, MENU.view);
  const checkbox = page.locator(`details.menu:nth-of-type(6) [data-pref="${pref}"]`);
  assert(await checkbox.count() === 1, `Missing view pref ${pref}`);
  const before = await checked(checkbox);
  await checkbox.click();
  visitedPrefs.add(pref);
  const settings = await localSettings(page);
  assert(settings[pref] === !before, `${pref} was not persisted`);
  if (afterToggle) {
    await afterToggle(!before);
  }
}

async function assertChartComputed(page, label) {
  await page.waitForFunction(() => {
    const image = document.querySelector("#chartImage");
    const empty = document.querySelector("#emptyChart");
    return image && empty && image.hidden === false && empty.hidden === true && image.src.length > 1000;
  }, null, { timeout: 20000 });
  const state = await page.evaluate(() => {
    const image = document.querySelector("#chartImage");
    const empty = document.querySelector("#emptyChart");
    return {
      imageHidden: image?.hidden,
      emptyHidden: empty?.hidden,
      naturalWidth: image?.naturalWidth,
      naturalHeight: image?.naturalHeight,
      srcLength: image?.src?.length || 0
    };
  });
  assert(state.naturalWidth >= 360 && state.naturalHeight >= 360,
    `${label} returned an undersized or empty chart image: ${JSON.stringify(state)}`);
}

async function waitForCompute(page, predicate, timeout = 20000, label = "compute") {
  const response = await page.waitForResponse((candidate) => {
    const request = candidate.request();
    if (request.method() !== "POST" || !candidate.url().includes("/api/chart/compute")) {
      return false;
    }
    try {
      return predicate(JSON.parse(request.postData() || "{}"));
    } catch {
      return false;
    }
  }, { timeout });
  const payload = JSON.parse(response.request().postData() || "{}");
  const responseText = await response.text();
  assert(response.ok(), `Compute API failed with ${response.status()} for ${JSON.stringify(payload).slice(0, 800)}: ${responseText.slice(0, 800)}`);
  assert(Number(payload.imageWidth) <= 5000 && Number(payload.imageHeight) <= 5000,
    `${label} requested an oversized chart image: ${payload.imageWidth}x${payload.imageHeight}`);
  await assertChartComputed(page, label);
  return payload;
}

async function runDialogAction(page, menuNumber, action, title, visitedActions, onOpen, onOk) {
  await clickMenuAction(page, menuNumber, action, visitedActions);
  await page.locator("#optionDialog[open]").waitFor({ state: "visible", timeout: 5000 });
  assert(await page.locator("#optionDialogTitle").innerText() === title, `${action} opened the wrong dialog`);
  if (onOpen) {
    await onOpen();
  }
  const resultPromise = onOk ? onOk() : undefined;
  await page.locator("#optionDialogOk").click();
  const result = resultPromise ? await resultPromise : undefined;
  await page.locator("#optionDialog").waitFor({ state: "hidden", timeout: 5000 });
  return result;
}

async function selectDialogOption(page, index, value) {
  await page.locator("#optionDialogBody select").nth(index).selectOption(value);
}

async function fillDialogInput(page, index, value) {
  await page.locator("#optionDialogBody input").nth(index).fill(String(value));
}

async function fillDialogNumber(page, index, value) {
  await page.locator("#optionDialogBody input[type='number']").nth(index).fill(String(value));
}

async function main() {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1280, height: 800 },
    permissions: browserName === "chromium" ? ["clipboard-read", "clipboard-write"] : []
  });
  await context.addInitScript(() => {
    localStorage.clear();
    window.__moiraAudit = { closeCount: 0, confirmMessages: [], printCount: 0 };
    window.print = () => {
      window.__moiraAudit.printCount += 1;
    };
    window.close = () => {
      window.__moiraAudit.closeCount += 1;
    };
    window.confirm = (message) => {
      window.__moiraAudit.confirmMessages.push(message);
      return false;
    };
  });
  const page = await context.newPage();
  const messages = [];
  const computePayloads = [];
  const visitedActions = new Set();
  const visitedPrefs = new Set();
  const visitedTabPanels = new Set();
  const visitedControls = new Set();
  const visitedViews = new Set();
  const visitedFormOptions = new Set();

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      messages.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => messages.push(`pageerror: ${error.message}`));
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/chart/compute")) {
      try {
        computePayloads.push(JSON.parse(request.postData() || "{}"));
      } catch {
        computePayloads.push({});
      }
    }
  });

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.locator("#chartImage:not([hidden])").waitFor({ state: "visible", timeout: 20000 });
    assert(await page.title() === "七政四餘星盤 - Moira", "Unexpected page title");

    const availableActions = await page.$$eval("[data-action]", (nodes) => [...new Set(nodes.map((node) => node.dataset.action))]);
    const availablePrefs = await page.$$eval("[data-pref]", (nodes) => [...new Set(nodes.map((node) => node.dataset.pref))]);
    const availableTabPanels = await page.$$eval("[data-tab-panel]", (nodes) => [...new Set(nodes.map((node) => node.dataset.tabPanel))]);
    const availableControls = await page.$$eval("[data-set-control]", (nodes) => [...new Set(nodes.map((node) => `${node.dataset.setControl}=${node.dataset.setValue}`))]);
    const availableViews = await page.$$eval("[data-view-target]", (nodes) => [...new Set(nodes.map((node) => node.dataset.viewTarget))]);

    await clickMenuAction(page, MENU.file, "new", visitedActions);
    await page.locator("#chartView.active #chartImage:not([hidden])").waitFor({ state: "visible", timeout: 20000 });
    assert(await inputValue(page, "name") === "", "File > new did not reset name");

    const openChooser = page.waitForEvent("filechooser");
    await clickMenuAction(page, MENU.file, "open", visitedActions);
    await openChooser;

    const mriDownload = page.waitForEvent("download");
    await clickMenuAction(page, MENU.file, "save", visitedActions);
    assert((await mriDownload).suggestedFilename().endsWith(".mri"), "File > save did not download an MRI file");

    const jsonDownload = page.waitForEvent("download");
    await clickMenuAction(page, MENU.file, "save-as", visitedActions);
    assert((await jsonDownload).suggestedFilename().endsWith(".json"), "File > save-as did not download JSON");

    await clickMenuAction(page, MENU.file, "print", visitedActions);
    assert(await page.evaluate(() => window.__moiraAudit.printCount) > 0, "File > print did not call print");

    await runDialogAction(page, MENU.file, "image-size", "圖形面積設定", visitedActions, async () => {
      await fillDialogInput(page, 0, 1180);
      await fillDialogInput(page, 1, 760);
    });

    const imageDownload = page.waitForEvent("download");
    await clickMenuAction(page, MENU.file, "save-image", visitedActions);
    assert((await imageDownload).suggestedFilename().endsWith(".png"), "File > save-image did not download PNG");

    const modificationChooser = page.waitForEvent("filechooser");
    await clickMenuAction(page, MENU.file, "open-modification", visitedActions);
    await modificationChooser;

    await clickMenuAction(page, MENU.file, "restore-modification", visitedActions);
    assert(await inputValue(page, "note") === "", "File > restore-modification did not clear note");

    const evaluationChooser = page.waitForEvent("filechooser");
    await clickMenuAction(page, MENU.file, "open-evaluation", visitedActions);
    await evaluationChooser;

    await clickMenuAction(page, MENU.file, "restore-evaluation", visitedActions);
    assert((await page.locator("#noteText").innerText()).length > 0, "File > restore-evaluation did not restore notes");

    await clickMenuAction(page, MENU.file, "refresh-evaluation", visitedActions);
    await page.locator("#notesView.active").waitFor({ state: "visible", timeout: 20000 });

    await runDialogAction(page, MENU.file, "print-notes", "列印及圖形註釋", visitedActions, async () => {
      await page.locator("#optionDialogBody textarea").fill("audit note");
    });
    assert(await inputValue(page, "note") === "audit note", "File > print-notes did not update note");

    await clickMenuAction(page, MENU.file, "save-settings", visitedActions);
    assert((await page.locator("#resultBox").innerText()).includes("設定已保存"), "File > save-settings did not notify");

    await clickViewTarget(page, MENU.view, "manage", visitedViews);
    await clickMenuAction(page, MENU.file, "append", visitedActions);
    assert(await page.locator("#manageView.show-import").count() === 1, "File > append did not expose import area");

    await page.locator("#saveEntry").click();
    await page.locator("#entryTable tr").first().waitFor({ state: "visible", timeout: 5000 });
    await page.locator("input[name='name']").evaluate((node) => {
      node.value = "Audit Update";
      node.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clickMenuAction(page, MENU.file, "update", visitedActions);
    assert((await page.locator("#entryTable").innerText()).includes("Audit Update"), "File/View > update did not update selected entry");
    await clickMenuAction(page, MENU.file, "delete", visitedActions);

    await clickMenuAction(page, MENU.edit, "focus-name", visitedActions);
    assert(await page.locator("input[name='name']").evaluate((node) => document.activeElement === node), "Edit > focus-name did not focus name");

    await runDialogAction(page, MENU.edit, "lunar-converter", "陰曆轉換", visitedActions, null, async () => {
      await fillDialogInput(page, 0, "2006-04-10");
    });
    assert(await inputValue(page, "birthDate") === "2006-04-10", "Edit > lunar-converter did not sync birth date");

    await runDialogAction(page, MENU.edit, "edit-life-palace", "立命安身", visitedActions, async () => {
      await selectDialogOption(page, 0, "1");
      await selectDialogOption(page, 1, "2");
    }, async () => waitForCompute(page, (payload) => payload.lifeMode === "1" && payload.selfMode === "2"));

    await runDialogAction(page, MENU.edit, "edit-star-position", "修改星曜位置", visitedActions, async () => {
      await page.locator("#optionDialog label", { hasText: "天" }).locator("input").check({ force: true });
    }, async () => waitForCompute(page, (payload) => String(payload.signDisplay || "").split(",")[7] === "1", 30000, "edit-star-position"));
    assert((await localSettings(page)).selectedPlanets.includes("天"), "Edit > edit-star-position did not persist star list");

    await page.locator("input[name='name']").fill("abc中文def");
    await page.locator("input[name='name']").evaluate((node) => {
      node.focus();
      node.setSelectionRange(3, 5);
    });
    await clickMenuAction(page, MENU.edit, "copy", visitedActions);
    await clickMenuAction(page, MENU.edit, "cut", visitedActions);
    assert(await inputValue(page, "name") === "abcdef", "Edit > cut did not edit selected text");
    await page.locator("input[name='name']").evaluate((node) => {
      node.focus();
      node.setSelectionRange(node.value.length, node.value.length);
    });
    await clickMenuAction(page, MENU.edit, "paste", visitedActions);
    await page.waitForFunction(() => document.querySelector("input[name='name']")?.value.includes("中文"), null, { timeout: 5000 });
    assert((await inputValue(page, "name")).includes("中文"), "Edit > paste did not insert clipboard text");
    await page.locator("input[name='name']").evaluate((node) => {
      node.focus();
      node.setSelectionRange(0, node.value.length);
    });
    await clickMenuAction(page, MENU.edit, "delete-selection", visitedActions);
    assert(await inputValue(page, "name") === "", "Edit > delete-selection did not clear selected text");
    await clickMenuAction(page, MENU.edit, "undo", visitedActions);
    await clickMenuAction(page, MENU.edit, "redo", visitedActions);
    for (const view of ["calculation", "eight", "notes"]) {
      await clickViewTarget(page, MENU.view, view, visitedViews);
      await clickMenuAction(page, MENU.edit, "select-all", visitedActions);
      const pageText = await page.locator(`#${view === "calculation" ? "resultBox" : view === "eight" ? "eightText" : "noteText"}`).innerText();
      const selectedText = await page.evaluate(() => String(window.getSelection()));
      assert(pageText.trim().length > 0, `${view} text page was empty before select-all`);
      assert(selectedText.trim() === pageText.trim(),
        `Edit > select-all did not select the ${view} text page`);
    }
    await clickMenuAction(page, MENU.edit, "bold", visitedActions);
    await clickMenuAction(page, MENU.edit, "highlight", visitedActions);

    for (const value of ["traditional", "pick", "western", "sidereal"]) {
      await clickSetControl(page, 0, "mode", value, visitedControls);
    }
    for (const value of ["0", "2"]) {
      await clickSetControl(page, 1, "timeAdjust", value, visitedControls);
    }

    for (const name of ["showNow", "showFixstar", "showCompass", "showGauquelin", "singleWheel", "showHoriz", "showAspects", "showAnnotations"]) {
      await toggleFormCheckbox(page, name, visitedFormOptions, computePayloads);
    }

    await runDialogAction(page, MENU.options, "life-body-settings", "立命安身", visitedActions, async () => {
      await selectDialogOption(page, 0, "2");
      await selectDialogOption(page, 1, "1");
    }, async () => waitForCompute(page, (payload) => payload.lifeMode === "2" && payload.selfMode === "1"));

    await runDialogAction(page, MENU.options, "pick-settings", "選擇擇日計算", visitedActions, async () => {
      await page.locator("#optionDialogBody input[type='checkbox']").first().check();
    }, async () => waitForCompute(page, (payload) => payload.mode === "pick" && payload.pickSiderealMode === "true"));

    for (const panel of ["calculation", "eight", "notes", "manage"]) {
      await toggleTabPanel(page, panel, visitedTabPanels);
    }

    await toggleToolbar(page, "toolbarFile", "#importMri", visitedPrefs);
    await toggleToolbar(page, "toolbarEdit", "#saveEntry", visitedPrefs);
    await toggleToolbar(page, "toolbarOptions", ".nudge-button", visitedPrefs);
    await toggleToolbar(page, "toolbarSearch", ".archive-name", visitedPrefs);

    await clickSetControl(page, 0, "mode", "western", visitedControls);
    await runDialogAction(page, MENU.options, "planet-settings", "選擇星曜", visitedActions, async () => {
      await page.locator("#optionDialog label", { hasText: "凱" }).locator("input[type='checkbox']").first().check();
      await page.locator("#optionDialog fieldset", { hasText: "流年納入計算" }).locator("label", { hasText: "月" }).locator("input").first().check();
    }, async () => waitForCompute(page, (payload) => {
      const astro = String(payload.astroSignDisplay || "").split(",");
      const transit = String(payload.transitSignDisplay || "").split(",");
      return astro[17] === "1" && transit[1] === "1";
    }));

    await runDialogAction(page, MENU.options, "strength-settings", "選擇星曜及強勢角距", visitedActions, async () => {
      await fillDialogNumber(page, 1, 12);
      await fillDialogNumber(page, 2, 13);
    }, async () => waitForCompute(page, (payload) => payload.ascInfluence === "12" && payload.mcInfluence === "13"));

    await runDialogAction(page, MENU.options, "aspect-settings", "選擇相位", visitedActions, async () => {
      await page.locator("#optionDialog label", { hasText: "六合" }).locator("input").check();
    }, async () => waitForCompute(page, (payload) => String(payload.aspectDisplay || "").split(",")[4] === "1"));

    await runDialogAction(page, MENU.options, "angle-settings", "選擇角距顯示", visitedActions, async () => {
      await page.locator("#optionDialogBody label", { hasText: "顯示角距標記" }).locator("input").check({ force: true });
      await page.locator("#optionDialog label", { hasText: "沖" }).locator("input").check();
    }, async () => waitForCompute(page, (payload) => payload.showAngleMarker === "true" && String(payload.angleMarkerDisplay || "").split(",")[1] === "1"));

    await runDialogAction(page, MENU.options, "house-settings", "選擇分宮制", visitedActions, async () => {
      await page.locator("#optionDialogBody input[type='checkbox']").check();
      await selectDialogOption(page, 0, "5");
      await selectDialogOption(page, 1, "4");
    }, async () => waitForCompute(page, (payload) => payload.showHouseSystem === "true" && payload.houseSystemIndex === "5" && payload.pickHouseSystemIndex === "4"));

    await runDialogAction(page, MENU.options, "zodiac-settings", "選擇回歸恆星制", visitedActions, async () => {
      await page.locator("#optionDialogBody input[type='checkbox']").check();
      await selectDialogOption(page, 0, "1");
      await selectDialogOption(page, 1, "sidereal");
    }, async () => waitForCompute(page, (payload) => payload.astroSystemMode === "true" && payload.astroSiderealIndex === "1" && payload.zodiacMode === "sidereal"));

    await runDialogAction(page, MENU.options, "synastry-settings", "選擇合盤計算", visitedActions, async () => {
      await selectDialogOption(page, 0, "relationship");
      await page.locator("#optionDialogBody input[type='checkbox']").check();
    }, async () => waitForCompute(page, (payload) => payload.mode === "western" && payload.astroMode === "relationship" && payload.singleWheel === "true"));

    await runDialogAction(page, MENU.options, "spirit-settings", "選擇神煞", visitedActions, async () => {
      await page.locator("#optionDialogBody label", { hasText: "顯示三垣列宿" }).locator("input").check({ force: true });
      await page.locator("#optionDialogBody label", { hasText: "顯示開禧宿度" }).locator("input").check({ force: true });
    }, async () => waitForCompute(page, (payload) => payload.showFixstar === "true" && payload.showCompass === "true"));

    await runDialogAction(page, MENU.options, "pattern-settings", "選擇政餘格局", visitedActions, async () => {
      await page.locator("#optionDialogBody input[type='checkbox']").check();
      await fillDialogNumber(page, 0, 5);
    }, async () => waitForCompute(page, (payload) => payload.showStyle === "true" && payload.styleLevel === "5"));

    await runDialogAction(page, MENU.options, "font-direction", "字形方向設定", visitedActions, async () => {
      await selectDialogOption(page, 0, "horizontal");
    }, async () => waitForCompute(page, (payload) => payload.fontDirection === "horizontal"));

    await runDialogAction(page, MENU.options, "font-settings", "字形設定", visitedActions, async () => {
      await selectDialogOption(page, 0, "PingFang TC");
    });
    assert((await page.locator("body").evaluate((node) => node.style.fontFamily)).includes("PingFang TC"), "Options > font-settings did not apply interface font");

    await runDialogAction(page, MENU.options, "color-settings", "色彩設定", visitedActions, async () => {
      await fillDialogInput(page, 0, "#353535");
      await page.locator("#optionDialogBody input[type='checkbox']").check();
    }, async () => waitForCompute(page, (payload) => payload.noColor === "true"));
    assert(await page.locator("body.monochrome-chart").count() === 1, "Options > color-settings did not apply monochrome");

    await togglePref(page, "monochrome", visitedPrefs, async (enabled) => {
      await waitForCompute(page, (payload) => payload.noColor === String(enabled), 30000, "monochrome");
      assert(await page.locator("body.monochrome-chart").count() === (enabled ? 1 : 0), "Options > monochrome did not toggle body class");
    });

    await clickMenuAction(page, MENU.options, "toggle-language", visitedActions);
    assert(await page.locator("body.simplified-labels").count() === 1, "Options > toggle-language did not toggle body class");
    assert(await page.locator("html").getAttribute("lang") === "zh-CN", "Options > toggle-language did not update html lang");

    const resetOptionsResponse = waitForCompute(page, (payload) => payload.noColor === "false" && payload.fontDirection === "vertical", 30000, "reset-options");
    await clickMenuAction(page, MENU.options, "reset-options", visitedActions);
    await resetOptionsResponse;
    assert(!(await localSettings(page)).simplifiedLabels, "Options > reset-options did not reset language preference");

    for (const [action, title] of SEARCH_ACTIONS) {
      console.log(`Auditing search action ${action}`);
      await clickMenuAction(page, MENU.search, action, visitedActions);
      await page.locator("#optionDialog[open]").waitFor({ state: "visible", timeout: 5000 });
      assert(await page.locator("#optionDialogTitle").innerText() === title, `${action} opened wrong search dialog`);
      const searchResponse = page.waitForResponse((response) => response.url().includes("/api/search/run"), { timeout: 30000 });
      await page.locator("#optionDialogOk").click();
      const response = await searchResponse;
      const responseText = await response.text();
      assert(response.ok(), `${action} search API failed with ${response.status()}: ${responseText.slice(0, 800)}`);
      const target = action === "search-eight-time" ? "#eightView.active #eightText" : "#calculationView.active #resultBox";
      await page.locator(target).waitFor({ state: "visible", timeout: 30000 });
      assert((await page.locator(target).innerText()).trim().length > 0, `${action} produced empty output`);
    }

    await clickMenuAction(page, MENU.search, "focus-name", visitedActions);
    assert(await page.locator("input[name='name']").evaluate((node) => document.activeElement === node), "Search > focus-name did not focus name");

    const now = new Date();
    const expectedNowDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    await clickViewTarget(page, MENU.search, "manage", visitedViews);
    const currentTimeResponse = waitForCompute(page, (payload) => payload.nowDate === expectedNowDate, 30000, "set-current-time");
    await clickMenuAction(page, MENU.view, "set-current-time", visitedActions);
    await currentTimeResponse;
    assert(await inputValue(page, "nowDate") === expectedNowDate, "View > set-current-time did not update date");

    await toggleViewPref(page, "highResolutionUi", visitedPrefs, async () => {
      await waitForCompute(page, (payload) => Number(payload.imageZoom) >= 200);
      assert(await page.locator("body.high-resolution-ui").count() === 1, "View > high-resolution did not toggle body class");
    });

    for (const view of ["chart", "calculation", "eight", "notes", "manage"]) {
      await clickViewTarget(page, MENU.view, view, visitedViews);
    }
    await clickViewTarget(page, MENU.moira, "chart", visitedViews);
    await clickViewTarget(page, MENU.moira, "calculation", visitedViews);
    await clickViewTarget(page, MENU.help, "calculation", visitedViews);
    await clickViewTarget(page, MENU.help, "notes", visitedViews);

    await clickViewTarget(page, MENU.view, "manage", visitedViews);
    await page.locator("#saveEntry").click();
    await page.locator("#entryTable tr").first().waitFor({ state: "visible", timeout: 5000 });
    await page.evaluate(() => {
      window.__moiraAudit.confirmMessages = [];
      window.confirm = (message) => {
        window.__moiraAudit.confirmMessages.push(message);
        return true;
      };
    });
    const closeSaveDownload = page.waitForEvent("download");
    await clickMenuAction(page, MENU.file, "close-window", visitedActions);
    assert((await closeSaveDownload).suggestedFilename().endsWith(".mri"),
      "File > close-window should save an MRI file when dirty data is confirmed");
    const closeAudit = await page.evaluate(() => window.__moiraAudit);
    assert(closeAudit.confirmMessages.includes("数据已更改，储存档案？"),
      `File > close-window did not show the dirty data prompt: ${JSON.stringify(closeAudit.confirmMessages)}`);
    const exitRequested = await page.locator("body.app-exit-requested").count();
    assert(closeAudit.closeCount > 0 || exitRequested === 1,
      "File > close-window did not request browser window close after saving dirty data");
    await page.evaluate(() => {
      window.confirm = (message) => {
        window.__moiraAudit.confirmMessages.push(message);
        return false;
      };
      document.body.classList.remove("app-exit-requested");
    });

    await togglePref(page, "minimizeToTray", visitedPrefs);
    await clickMenuAction(page, MENU.file, "close-window", visitedActions);
    assert(await page.locator("body.app-minimized").count() === 1, "File > close-window did not show minimized state when tray preference is enabled");

    const missingActions = availableActions.filter((action) => !visitedActions.has(action));
    const missingPrefs = availablePrefs.filter((pref) => !visitedPrefs.has(pref));
    const missingTabPanels = availableTabPanels.filter((panel) => !visitedTabPanels.has(panel));
    const missingControls = availableControls.filter((control) => !visitedControls.has(control));
    const missingViews = availableViews.filter((view) => !visitedViews.has(view));
    assert(missingActions.length === 0, `Unaudited actions: ${missingActions.join(", ")}`);
    assert(missingPrefs.length === 0, `Unaudited prefs: ${missingPrefs.join(", ")}`);
    assert(missingTabPanels.length === 0, `Unaudited tab panels: ${missingTabPanels.join(", ")}`);
    assert(missingControls.length === 0, `Unaudited set controls: ${missingControls.join(", ")}`);
    assert(missingViews.length === 0, `Unaudited view targets: ${missingViews.join(", ")}`);
    assert(messages.length === 0, `Console/page errors during audit:\n${messages.join("\n")}`);

    console.log(`Menu audit passed for ${baseUrl} (${browserName})`);
    console.log(`Audited ${visitedActions.size} actions, ${visitedPrefs.size} prefs, ${visitedTabPanels.size} tab toggles, ${visitedControls.size} set-controls, ${visitedViews.size} view targets.`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
