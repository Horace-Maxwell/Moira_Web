#!/usr/bin/env node

import { chromium, firefox, webkit } from "playwright";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const baseUrl = process.argv[2] || "http://127.0.0.1:8080";
const browserName = process.env.MOIRA_WEB_BROWSER || "chromium";
const browserType = { chromium, firefox, webkit }[browserName];

if (!browserType) {
  throw new Error(`Unsupported MOIRA_WEB_BROWSER=${browserName}`);
}

const MENU = {
  file: 2,
  edit: 3,
  options: 4,
  search: 5
};

const SEARCH_ACTIONS = [
  ["search-transit", "流年星法", "transit"],
  ["search-primary", "主限法", "primary-direction"],
  ["search-secondary", "次限法", "secondary-progression"],
  ["search-solar-arc", "太陽弧角法", "solar-arc"],
  ["search-sun-mountain", "動盤太陽到山時間", ""],
  ["search-eight-time", "八字時間", ""],
  ["search-solar-eclipse", "日蝕時間", ""],
  ["search-lunar-eclipse", "月蝕時間", ""],
  ["search-aspect", "相位", "transit"]
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function openMenu(page, menuNumber) {
  const menu = page.locator(`details.menu:nth-of-type(${menuNumber})`);
  if (!(await menu.evaluate((node) => node.open))) {
    await menu.locator(":scope > summary").click();
  }
}

async function clickMenuAction(page, menuNumber, action) {
  await openMenu(page, menuNumber);
  const command = page.locator(`details.menu:nth-of-type(${menuNumber}) > .menu-panel [data-action="${action}"]`).first();
  assert(await command.count() === 1, `Missing menu action ${action}`);
  await command.click();
}

async function openOptionsCascade(page, cascadeIndex) {
  await openMenu(page, MENU.options);
  const cascade = page.locator("details.menu:nth-of-type(4) details.menu-cascade").nth(cascadeIndex);
  await cascade.locator("summary").hover();
  await page.locator("details.menu:nth-of-type(4) .menu-subpanel:visible").waitFor({ state: "visible", timeout: 5000 });
}

async function setMode(page, mode) {
  await openOptionsCascade(page, 0);
  const request = waitForCompute(page, (payload) => payload.mode === mode, `mode=${mode}`);
  await page.locator(`details.menu:nth-of-type(4) .menu-subpanel:visible [data-set-control="mode"][data-set-value="${mode}"]`).click();
  const payload = await request;
  if (mode !== "western") {
    assert(payload.astroMode === "natal",
      `${mode} mode should reset incompatible astrology mode, got ${payload.astroMode}`);
  }
  return payload;
}

async function assertChartComputed(page, label) {
  await page.waitForFunction(() => {
    const image = document.querySelector("#chartImage");
    const empty = document.querySelector("#emptyChart");
    return image && empty && image.hidden === false && empty.hidden === true && image.src.length > 1000;
  }, null, { timeout: 30000 });
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
    `${label} left the chart blank or undersized: ${JSON.stringify(state)}`);
}

async function waitForCompute(page, predicate, label, timeout = 30000) {
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
  const body = await response.text();
  assert(response.ok(), `${label} compute failed ${response.status()}: ${body.slice(0, 500)}`);
  assert(Number(payload.imageWidth) <= 5000 && Number(payload.imageHeight) <= 5000,
    `${label} requested an oversized image: ${payload.imageWidth}x${payload.imageHeight}`);
  await assertChartComputed(page, label);
  return payload;
}

async function inputValue(page, name) {
  return page.locator(`[name="${name}"]`).inputValue();
}

async function runComputeDialog(page, menuNumber, action, title, configure, predicate, label = action) {
  await clickMenuAction(page, menuNumber, action);
  await page.locator("#optionDialog[open]").waitFor({ state: "visible", timeout: 5000 });
  assert(await page.locator("#optionDialogTitle").innerText() === title, `${action} opened the wrong dialog`);
  await configure();
  const response = waitForCompute(page, predicate, label);
  await page.locator("#optionDialogOk").click();
  const payload = await response;
  await page.locator("#optionDialog").waitFor({ state: "hidden", timeout: 5000 });
  return payload;
}

async function runDialog(page, menuNumber, action, title, configure, verify) {
  await clickMenuAction(page, menuNumber, action);
  await page.locator("#optionDialog[open]").waitFor({ state: "visible", timeout: 5000 });
  assert(await page.locator("#optionDialogTitle").innerText() === title, `${action} opened the wrong dialog`);
  await configure();
  await page.locator("#optionDialogOk").click();
  await page.locator("#optionDialog").waitFor({ state: "hidden", timeout: 5000 });
  if (verify) {
    await verify();
  }
}

async function checkAllInputs(locator) {
  const count = await locator.count();
  assert(count > 0, "Expected at least one checkbox to check");
  for (let index = 0; index < count; index += 1) {
    await locator.nth(index).check({ force: true });
  }
}

async function labelInput(page, text) {
  return page.locator("#optionDialog label", { hasText: text }).locator("input").first();
}

async function localSettings(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("moira-web.settings") || "{}"));
}

async function postChartDirect(payload) {
  const response = await fetch(new URL("/api/chart/compute", baseUrl).toString(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  assert(response.ok, `direct chart compute failed ${response.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

async function auditTextTabs(page) {
  for (const [view, selector] of [
    ["calculation", "#resultBox"],
    ["eight", "#eightText"],
    ["notes", "#noteText"]
  ]) {
    await page.locator(`.main-tabs .tab[data-view="${view}"]`).click();
    await page.locator(`.app-window[data-current-view="${view}"]`).waitFor({ state: "attached", timeout: 5000 });
    const text = await page.locator(selector).innerText();
    assert(text.trim().length > 0, `Text view ${view} rendered empty content`);
  }
  await page.locator(".main-tabs .tab[data-view='chart']").click();
  await assertChartComputed(page, "return from text views");
}

async function auditDirectFormAndKeyboard(page) {
  await page.locator(".main-tabs .tab[data-view='chart']").click();
  await assertChartComputed(page, "direct form starting chart");

  let request = waitForCompute(page, (payload) => payload.name === "直接输入测试", "direct-name");
  await page.locator("input[name='name']").fill("直接输入测试");
  await request;

  request = waitForCompute(page, (payload) => payload.sex === "female", "direct-sex");
  await page.locator("input[name='sex'][value='female']").check();
  await request;

  request = waitForCompute(page, (payload) => payload.country === "美國" && payload.city === "洛杉磯" && payload.zone === "America/Los_Angeles", "direct-place");
  await page.locator("select[name='country']").selectOption("美國");
  await page.locator("select[name='city']").selectOption("洛杉磯");
  await page.locator("select[name='zone']").selectOption("America/Los_Angeles");
  await request;

  request = waitForCompute(page, (payload) => payload.birthDate === "1999-12-31" && payload.birthTime === "23:45", "direct-birth-date-row");
  await page.locator(".moira-date-row[data-datetime='birth'] [data-part='month']").selectOption("12");
  await page.locator(".moira-date-row[data-datetime='birth'] [data-part='day']").fill("31");
  await page.locator(".moira-date-row[data-datetime='birth'] [data-part='year']").fill("1999");
  await page.locator(".moira-date-row[data-datetime='birth'] [data-part='hour']").fill("11");
  await page.locator(".moira-date-row[data-datetime='birth'] [data-part='minute']").fill(":45");
  await page.locator(".moira-date-row[data-datetime='birth'] [data-part='ampm']").selectOption("PM");
  await request;

  request = waitForCompute(page, (payload) => payload.nowDate === "2028-01-02" && payload.nowTime === "00:05", "direct-now-date-row");
  await page.locator(".moira-date-row[data-datetime='now'] [data-part='month']").selectOption("1");
  await page.locator(".moira-date-row[data-datetime='now'] [data-part='day']").fill("2");
  await page.locator(".moira-date-row[data-datetime='now'] [data-part='year']").fill("2028");
  await page.locator(".moira-date-row[data-datetime='now'] [data-part='hour']").fill("12");
  await page.locator(".moira-date-row[data-datetime='now'] [data-part='minute']").fill(":05");
  await page.locator(".moira-date-row[data-datetime='now'] [data-part='ampm']").selectOption("AM");
  await request;

  request = waitForCompute(page, (payload) => payload.name === "自动重算测试", "direct-auto-submit");
  await page.locator("input[name='name']").fill("自动重算测试");
  await request;

  for (const [view, selector] of [
    ["calculation", "#resultBox"],
    ["eight", "#eightText"],
    ["notes", "#noteText"]
  ]) {
    await page.locator(`.main-tabs .tab[data-view="${view}"]`).click();
    await page.locator(`.app-window[data-current-view="${view}"]`).waitFor({ state: "attached", timeout: 5000 });
    const text = (await page.locator(selector).innerText()).trim();
    await page.locator(".workspace").click({ position: { x: 12, y: 12 } });
    await page.keyboard.press("Control+A");
    const selected = (await page.evaluate(() => String(window.getSelection()))).trim();
    assert(selected === text, `Keyboard select-all failed for ${view}`);
  }
  await page.locator(".main-tabs .tab[data-view='chart']").click();
  await assertChartComputed(page, "direct form return chart");
}

async function auditImageAndNoteDialogs(page) {
  await runComputeDialog(page, MENU.file, "image-size", "圖形面積設定", async () => {
    await page.locator("#optionDialogBody input[type='number']").nth(0).fill("1400");
    await page.locator("#optionDialogBody input[type='number']").nth(1).fill("900");
  }, (payload) => Number(payload.imageWidth) >= 1400 && Number(payload.imageHeight) >= 900, "image-size");

  await runComputeDialog(page, MENU.file, "print-notes", "列印及圖形註釋", async () => {
    await page.locator("#optionDialogBody textarea").fill("deep option note 中文");
    await page.locator("#optionDialogBody input[type='checkbox']").check();
  }, (payload) => payload.note === "deep option note 中文", "print-notes");
  assert((await localSettings(page)).printNotes === true, "print-notes did not persist printNotes");

  await runComputeDialog(page, MENU.edit, "lunar-converter", "陰曆轉換", async () => {
    await page.locator("#optionDialogBody input[type='date']").fill("2001-02-03");
  }, (payload) => payload.birthDate === "2001-02-03", "lunar-converter");
}

async function auditFileChooserImports(page) {
  const directory = await mkdtemp(join(tmpdir(), "moira-web-audit-"));
  const modificationPath = join(directory, "modification-note.txt");
  const evaluationPath = join(directory, "evaluation-note.txt");
  await writeFile(modificationPath, "文件导入修改内容", "utf8");
  await writeFile(evaluationPath, "文件导入解盘内容", "utf8");

  let chooser = page.waitForEvent("filechooser");
  await clickMenuAction(page, MENU.file, "open-modification");
  let fileChooser = await chooser;
  const modificationCompute = waitForCompute(page, (payload) => payload.note === "文件导入修改内容", "open-modification-file");
  await fileChooser.setFiles(modificationPath);
  await modificationCompute;
  assert(await inputValue(page, "note") === "文件导入修改内容", "open-modification did not populate note field");

  chooser = page.waitForEvent("filechooser");
  await clickMenuAction(page, MENU.file, "open-evaluation");
  fileChooser = await chooser;
  await fileChooser.setFiles(evaluationPath);
  await page.locator(".app-window[data-current-view='notes']").waitFor({ state: "attached", timeout: 5000 });
  assert((await page.locator("#noteText").innerText()).includes("文件导入解盘内容"),
    "open-evaluation did not render imported text");
}

async function auditLifeAndPickDialogs(page) {
  for (const value of ["0", "1", "2"]) {
    await runComputeDialog(page, MENU.options, "life-body-settings", "立命安身", async () => {
      await page.locator("#optionDialogBody select").nth(0).selectOption(value);
      await page.locator("#optionDialogBody select").nth(1).selectOption(value);
    }, (payload) => payload.lifeMode === value && payload.selfMode === value, `life-body-${value}`);
  }

  await runComputeDialog(page, MENU.options, "pick-settings", "選擇擇日計算", async () => {
    const checkboxes = page.locator("#optionDialogBody input[type='checkbox']");
    await checkboxes.nth(0).check();
    await checkboxes.nth(1).check();
    await checkboxes.nth(2).check();
    await checkboxes.nth(3).uncheck();
  }, (payload) => (
    payload.mode === "pick"
    && payload.pickSiderealMode === "true"
    && payload.pickHouseMode === "true"
    && payload.pickAdjustMode === "true"
    && payload.daySet === "false"
  ), "pick-settings-all");
}

async function auditPlanetDialogs(page) {
  await setMode(page, "traditional");
  await runComputeDialog(page, MENU.options, "planet-settings", "選擇星曜", async () => {
    await (await labelInput(page, "天")).check({ force: true });
    await (await labelInput(page, "晚上使用夜福點")).uncheck({ force: true });
    await (await labelInput(page, "計南羅北")).check({ force: true });
    await (await labelInput(page, "地面")).check({ force: true });
    await page.locator("#optionDialog label", { hasText: "海拔" }).locator("input[type='number']").fill("321");
    await page.locator("#optionDialog label", { hasText: "顯示十二宮" }).locator("input").check({ force: true });
    await page.locator("#optionDialogBody select").first().selectOption("6");
    await page.locator("#optionDialog fieldset", { hasText: "流年納入計算" }).locator("label", { hasText: "月" }).locator("input").first().check({ force: true });
  }, (payload) => {
    const sign = String(payload.signDisplay || "").split(",");
    const transit = String(payload.transitSignDisplay || "").split(",");
    return sign[7] === "1"
      && transit[1] === "1"
      && payload.nightFortuneMode === "false"
      && payload.trueAsNorth === "false"
      && payload.topocentric === "true"
      && payload.altitude === "321"
      && payload.showHouseSystem === "true"
      && payload.houseSystemIndex === "6";
  }, "planet-traditional-all");

  await setMode(page, "pick");
  await runComputeDialog(page, MENU.options, "planet-settings", "選擇星曜", async () => {
    await page.locator("#optionDialog label", { hasText: "顯示十二宮" }).locator("input").check({ force: true });
    await page.locator("#optionDialogBody select").first().selectOption("4");
  }, (payload) => payload.mode === "pick" && payload.showHouseSystem === "true" && payload.pickHouseSystemIndex === "4", "planet-pick-house");

  await setMode(page, "western");
  await runComputeDialog(page, MENU.options, "strength-settings", "選擇星曜及強勢角距", async () => {
    await (await labelInput(page, "凱")).check({ force: true });
    await (await labelInput(page, "地面")).check({ force: true });
    await page.locator("#optionDialog label", { hasText: "海拔" }).locator("input[type='number']").fill("654");
    await page.locator("#optionDialog label", { hasText: "升" }).locator("input[type='number']").fill("12");
    await page.locator("#optionDialog label", { hasText: "頂" }).locator("input[type='number']").fill("13");
    await page.locator("#optionDialog fieldset", { hasText: "流年納入計算" }).locator("label", { hasText: "月" }).locator("input").first().check({ force: true });
  }, (payload) => {
    const astro = String(payload.astroSignDisplay || "").split(",");
    const transit = String(payload.transitSignDisplay || "").split(",");
    return astro[17] === "1"
      && transit[1] === "1"
      && payload.topocentric === "true"
      && payload.altitude === "654"
      && payload.ascInfluence === "12"
      && payload.mcInfluence === "13";
  }, "planet-western-strength");
}

async function auditAspectAndAngleDialogs(page) {
  await runComputeDialog(page, MENU.options, "aspect-settings", "選擇相位", async () => {
    await checkAllInputs(page.locator("#optionDialogBody input[type='checkbox']"));
  }, (payload) => String(payload.aspectDisplay || "").split(",").every((value) => value === "1"), "aspect-settings-all");

  await runComputeDialog(page, MENU.options, "angle-settings", "選擇角距顯示", async () => {
    await page.locator("#optionDialogBody label", { hasText: "顯示角距標記" }).locator("input").check({ force: true });
    await checkAllInputs(page.locator("#optionDialog fieldset", { hasText: "角距標記" }).locator("input[type='checkbox']"));
  }, (payload) => (
    payload.showAngleMarker === "true"
    && String(payload.angleMarkerDisplay || "").split(",").every((value) => value === "1")
  ), "angle-settings-all");
}

async function auditHouseZodiacAndSynastry(page) {
  for (const value of ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]) {
    await runComputeDialog(page, MENU.options, "house-settings", "選擇分宮制", async () => {
      await page.locator("#optionDialogBody input[type='checkbox']").check({ force: true });
      await page.locator("#optionDialogBody select").nth(0).selectOption(value);
      await page.locator("#optionDialogBody select").nth(1).selectOption(value);
    }, (payload) => payload.showHouseSystem === "true"
      && payload.houseSystemIndex === value
      && payload.pickHouseSystemIndex === value, `house-system-${value}`);
  }

  for (const value of ["0", "1", "2", "3", "4"]) {
    const zodiacMode = Number(value) % 2 === 0 ? "tropical" : "sidereal";
    await runComputeDialog(page, MENU.options, "zodiac-settings", "選擇回歸恆星制", async () => {
      await page.locator("#optionDialogBody input[type='checkbox']").check({ force: true });
      await page.locator("#optionDialogBody select").nth(0).selectOption(value);
      await page.locator("#optionDialogBody select").nth(1).selectOption(zodiacMode);
    }, (payload) => payload.astroSystemMode === "true"
      && payload.astroSiderealIndex === value
      && payload.zodiacMode === zodiacMode, `zodiac-${value}-${zodiacMode}`);
  }

  for (const value of ["relationship", "composite", "comparison"]) {
    await runComputeDialog(page, MENU.options, "synastry-settings", "選擇合盤計算", async () => {
      await page.locator("#optionDialogBody select").first().selectOption(value);
      await page.locator("#optionDialogBody input[type='checkbox']").check({ force: true });
    }, (payload) => payload.mode === "western" && payload.astroMode === value && payload.singleWheel === "true", `synastry-${value}`);
  }
}

async function auditSpiritPatternFontAndColor(page) {
  await runComputeDialog(page, MENU.options, "spirit-settings", "選擇神煞", async () => {
    await checkAllInputs(page.locator("#optionDialogBody input[type='checkbox']"));
  }, (payload) => payload.showAnnotations === "true" && payload.showFixstar === "true" && payload.showCompass === "true", "spirit-settings-all");
  const spirits = (await localSettings(page)).selectedSpirits || [];
  ["神煞註釋", "三垣列宿", "開禧宿度"].forEach((spirit) => {
    assert(spirits.includes(spirit), `spirit-settings did not persist ${spirit}`);
  });

  await runComputeDialog(page, MENU.options, "pattern-settings", "選擇政餘格局", async () => {
    await page.locator("#optionDialogBody input[type='checkbox']").check({ force: true });
    await page.locator("#optionDialogBody input[type='number']").fill("9");
  }, (payload) => payload.showStyle === "true" && payload.styleLevel === "9", "pattern-settings");

  for (const direction of ["horizontal", "vertical"]) {
    await runComputeDialog(page, MENU.options, "font-direction", "字形方向設定", async () => {
      await page.locator("#optionDialogBody select").first().selectOption(direction);
    }, (payload) => payload.fontDirection === direction, `font-direction-${direction}`);
  }

  for (const font of ["Lucida Grande", "Helvetica Neue", "PingFang TC", "AR PL UKai TW", "Noto Sans CJK TC"]) {
    await runDialog(page, MENU.options, "font-settings", "字形設定", async () => {
      await page.locator("#optionDialogBody select").first().selectOption(font);
    }, async () => {
      const family = await page.locator("body").evaluate((node) => node.style.fontFamily);
      assert(family.includes(font), `font-settings did not apply ${font}: ${family}`);
    });
  }

  await runComputeDialog(page, MENU.options, "color-settings", "色彩設定", async () => {
    await page.locator("#optionDialogBody input[type='color']").fill("#424242");
    await page.locator("#optionDialogBody input[type='checkbox']").check({ force: true });
  }, (payload) => payload.noColor === "true", "color-settings");
  const themeColor = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--chrome").trim());
  assert(themeColor === "#424242", `color-settings did not apply theme color: ${themeColor}`);
}

async function auditSearchInputs(page) {
  for (const [action, title, astroMode] of SEARCH_ACTIONS) {
    await clickMenuAction(page, MENU.search, action);
    await page.locator("#optionDialog[open]").waitFor({ state: "visible", timeout: 5000 });
    assert(await page.locator("#optionDialogTitle").innerText() === title, `${action} opened wrong search dialog`);
    await page.locator("#optionDialogBody input[type='date']").fill("2027-01-02");
    await page.locator("#optionDialogBody input[type='number']").fill("2");
    const responsePromise = page.waitForResponse((response) => response.url().includes("/api/search/run"), { timeout: 30000 });
    await page.locator("#optionDialogOk").click();
    const response = await responsePromise;
    const body = await response.text();
    assert(response.ok(), `${action} search failed ${response.status()}: ${body.slice(0, 500)}`);
    const payload = JSON.parse(response.request().postData() || "{}");
    assert(payload.searchDate === "2027-01-02" && payload.searchMonths === "24",
      `${action} did not send edited search inputs: ${JSON.stringify(payload)}`);
    if (astroMode) {
      assert(payload.mode === "western" && payload.astroMode === astroMode,
        `${action} did not switch to expected astro mode: ${JSON.stringify(payload)}`);
    }
    const target = action === "search-eight-time" ? "#eightText" : "#resultBox";
    await page.locator(target).waitFor({ state: "visible", timeout: 30000 });
    assert((await page.locator(target).innerText()).trim().length > 0, `${action} rendered empty search output`);
  }
}

async function auditModeCompatibility(page) {
  await clickMenuAction(page, MENU.search, "search-primary");
  await page.locator("#optionDialog[open]").waitFor({ state: "visible", timeout: 5000 });
  const searchResponse = page.waitForResponse((response) => response.url().includes("/api/search/run"), { timeout: 30000 });
  await page.locator("#optionDialogOk").click();
  const searchResult = await searchResponse;
  assert(searchResult.ok(), `search-primary failed before compatibility check: ${searchResult.status()}`);
  assert(await inputValue(page, "mode") === "western", "search-primary did not switch to western mode");
  assert(await inputValue(page, "astroMode") === "primary-direction",
    "search-primary did not set primary-direction astro mode");

  await openOptionsCascade(page, 0);
  const switchRequest = waitForCompute(page,
    (payload) => payload.mode === "traditional",
    "primary-direction-to-traditional");
  await page.locator("details.menu:nth-of-type(4) .menu-subpanel:visible [data-set-control='mode'][data-set-value='traditional']").click();
  const switchPayload = await switchRequest;
  assert(switchPayload.astroMode === "natal",
    `switching back to traditional should send astroMode=natal, got ${switchPayload.astroMode}`);
  assert(await inputValue(page, "astroMode") === "natal",
    "switching back to traditional did not reset the hidden astroMode field");
  await assertChartComputed(page, "primary-direction-to-traditional");

  const directResult = await postChartDirect({
    mode: "traditional",
    astroMode: "primary-direction",
    name: "",
    sex: "male",
    birthDate: "2026-05-17",
    birthTime: "18:56",
    country: "中國",
    city: "北京",
    zone: "Asia/Shanghai",
    nowDate: "2026-05-17",
    nowTime: "18:56",
    imageWidth: "720",
    imageHeight: "540"
  });
  assert(directResult.status === "computed", "direct incompatible mode request did not compute");
  assert(directResult.mode === "traditional" && directResult.astroMode === "natal",
    `backend did not normalize incompatible astro mode: ${directResult.mode}/${directResult.astroMode}`);
  assert(String(directResult.chartImage || "").startsWith("data:image/png;base64,"),
    "direct incompatible mode request did not return a PNG chart");
}

async function auditToolbarAndManager(page) {
  await page.locator(".main-tabs .tab[data-view='manage']").click();
  await page.locator("#saveEntry").click();
  await page.locator("#entryTable tr").first().waitFor({ state: "visible", timeout: 5000 });
  await page.locator("#entryTable tr").first().locator("[data-field='name']").evaluate((cell) => {
    cell.textContent = "深度审计";
    cell.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "深度审计" }));
  });
  await page.locator("#entryTable tr").first().locator("[data-field='place']").evaluate((cell) => {
    cell.textContent = "上海, 中国";
    cell.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "上海, 中国" }));
  });
  assert((await page.locator("#entryTable").innerText()).includes("深度审计"), "manager table did not accept Chinese input");
  await page.locator("#updateEntry").click();
  assert((await page.locator("#entryTable").innerText()).includes("深度审计"), "update toolbar did not keep edited manager row");

  await page.locator(".main-tabs .tab[data-view='chart']").click();
  await page.locator("input[name='name']").fill("第二列");
  await page.locator(".main-tabs .tab[data-view='manage']").click();
  await page.locator("#saveEntry").click();
  await page.locator("#entryTable tr").nth(1).waitFor({ state: "visible", timeout: 5000 });
  await page.locator(".nudge-button[aria-label='下一列']").click();
  assert((await page.locator("#entryTable tr.selected").innerText()).includes("深度审计"),
    "next-row toolbar button did not select the next entry");
  await page.locator(".nudge-button[aria-label='上一列']").click();
  assert((await page.locator("#entryTable tr.selected").innerText()).includes("第二列"),
    "previous-row toolbar button did not select the previous entry");

  await page.locator(".archive-name").fill("客户 档案/测试");
  const jsonDownload = page.waitForEvent("download");
  await page.locator("#exportEntries").click();
  assert((await jsonDownload).suggestedFilename() === "客户-档案-测试-entries.json",
    "archive name did not drive JSON export filename");
  const exportedJson = await page.locator("#entryImport").inputValue();
  await page.locator("#deleteEntry").click();
  await page.locator("#entryImport").fill(exportedJson);
  await page.locator("#importEntries").click();
  assert((await page.locator("#entryTable").innerText()).includes("深度审计"), "importEntries did not restore exported JSON");

  const mriDownload = page.waitForEvent("download");
  await page.locator("#exportMri").click();
  const downloadedMri = await mriDownload;
  assert(downloadedMri.suggestedFilename() === "客户-档案-测试.mri",
    "archive name did not drive MRI export filename");
  const mriBase64 = await page.locator("#entryImport").inputValue();
  await page.locator("#deleteEntry").click();
  await page.locator("#entryImport").fill(mriBase64);
  await page.locator("#importMri").click();
  await page.waitForFunction(() => document.querySelector("#entryTable")?.textContent?.trim().length > 0, null, { timeout: 30000 });
  assert((await page.locator("#entryTable tr").count()) >= 1, "importMri did not restore entries from pasted MRI data");

  const mriPath = await downloadedMri.path();
  assert(Boolean(mriPath), "MRI download path was not available for file chooser import");
  await page.locator("#entryImport").fill("");
  await page.locator("#deleteEntry").click();
  const chooser = page.waitForEvent("filechooser");
  await page.locator("#importMri").click();
  const fileChooser = await chooser;
  await fileChooser.setFiles(mriPath);
  await page.waitForFunction(() => document.querySelector("#entryTable")?.textContent?.trim().length > 0, null, { timeout: 30000 });
  assert((await page.locator("#entryTable tr").count()) >= 1, "importMri file chooser did not restore MRI entries");

  await page.locator("#entryTable tr").first().locator("td[data-field='name']").dblclick();
  await assertChartComputed(page, "manager double click");
  assert(await page.locator(".app-window").getAttribute("data-current-view") === "chart", "manager double click did not return to chart");
}

async function auditReloadPersistence(page, watchPage) {
  const before = await localSettings(page);
  assert(before.themeColor === "#424242", "theme color was not available before reload persistence check");
  assert(before.interfaceFont === "Noto Sans CJK TC", "font setting was not available before reload persistence check");
  assert(before.showAngleMarker === true, "angle marker setting was not available before reload persistence check");
  await page.evaluate(() => {
    window.eval("entriesDirty = false");
  });
  const persistedPage = await page.context().newPage();
  watchPage(persistedPage);
  await persistedPage.goto(baseUrl, { waitUntil: "networkidle" });
  await assertChartComputed(persistedPage, "reload persistence");
  const after = await localSettings(persistedPage);
  assert(after.themeColor === "#424242", "theme color did not persist after reload");
  assert(after.interfaceFont === "Noto Sans CJK TC", "font setting did not persist after reload");
  assert(after.showAngleMarker === true, "angle marker setting did not persist after reload");
  const themeColor = await persistedPage.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--chrome").trim());
  const family = await persistedPage.locator("body").evaluate((node) => node.style.fontFamily);
  assert(themeColor === "#424242", `theme color did not apply after reload: ${themeColor}`);
  assert(family.includes("Noto Sans CJK TC"), `font setting did not apply after reload: ${family}`);
  await persistedPage.close();
}

async function main() {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({
    acceptDownloads: true,
    viewport: { width: 1440, height: 900 },
    permissions: browserName === "chromium" ? ["clipboard-read", "clipboard-write"] : []
  });
  await context.addInitScript(() => {
    const auditStorageKey = "moira-web-audit-cleared";
    if (!localStorage.getItem(auditStorageKey)) {
      localStorage.clear();
      localStorage.setItem(auditStorageKey, "true");
    }
  });
  const page = await context.newPage();
  const messages = [];
  let currentStage = "bootstrap";
  const runStep = async (stage, task) => {
    currentStage = stage;
    return task();
  };
  const watchPage = (watchedPage) => {
    watchedPage.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) {
        messages.push(`${message.type()} at ${currentStage}: ${message.text()}`);
      }
    });
    watchedPage.on("pageerror", (error) => messages.push(`pageerror at ${currentStage}: ${error.message}`));
  };
  watchPage(page);

  try {
    await runStep("initial-load", async () => {
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await assertChartComputed(page, "initial load");
    });
    await runStep("text-tabs", () => auditTextTabs(page));
    await runStep("direct-form-keyboard", () => auditDirectFormAndKeyboard(page));
    await runStep("image-note-dialogs", () => auditImageAndNoteDialogs(page));
    await runStep("file-chooser-imports", () => auditFileChooserImports(page));
    await runStep("life-pick-dialogs", () => auditLifeAndPickDialogs(page));
    await runStep("planet-dialogs", () => auditPlanetDialogs(page));
    await runStep("aspect-angle-dialogs", () => auditAspectAndAngleDialogs(page));
    await runStep("house-zodiac-synastry", () => auditHouseZodiacAndSynastry(page));
    await runStep("spirit-pattern-font-color", () => auditSpiritPatternFontAndColor(page));
    await runStep("search-inputs", () => auditSearchInputs(page));
    await runStep("mode-compatibility", () => auditModeCompatibility(page));
    await runStep("toolbar-manager", () => auditToolbarAndManager(page));
    await runStep("reload-persistence", () => auditReloadPersistence(page, watchPage));
    assert(messages.length === 0, `Console/page errors during deep option audit:\n${messages.join("\n")}`);
    console.log(`Deep option audit passed for ${baseUrl} (${browserName})`);
    console.log("Audited dialog fields, dropdown choices, checkboxes, search inputs, toolbar import/export, and manager edit flows.");
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
