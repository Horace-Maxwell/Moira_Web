#!/usr/bin/env node

import { chromium } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:8080";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function within(value, min, max, label) {
  assert(value >= min && value <= max, `${label} expected ${min}-${max}, got ${value}`);
}

async function rect(page, selector) {
  return page.locator(selector).evaluate((element) => {
    const r = element.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height),
      right: Math.round(r.right),
      bottom: Math.round(r.bottom)
    };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const messages = [];
  const computePayloads = [];
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
    const assetStamp = await page.locator("link[rel='stylesheet']").getAttribute("href");
    assert(assetStamp.includes("app-ui-native-74"), `Unexpected asset cache stamp: ${assetStamp}`);
    assert(messages.length === 0, `Browser console had errors:\n${messages.join("\n")}`);
    const menubarText = await page.locator(".menubar").innerText();
    ["檔案(&F)", "編輯(&E)", "選項(&P)", "搜索(&S)", "檢視(&V)", "說明(&H)"].forEach((label) => {
      assert(menubarText.includes(label), `Missing native-style menu label ${label}`);
    });
    const disabledControls = await page.locator(".menubar [disabled]").count();
    assert(disabledControls === 0, `Top menus should not expose disabled commands, got ${disabledControls}`);

    const app = await rect(page, ".app-window");
    const menubar = await rect(page, ".menubar");
    const tabs = await rect(page, ".main-tabs");
    const subbar = await rect(page, ".subbar");
    const workspace = await rect(page, ".workspace");
    const canvas = await rect(page, ".chart-canvas");
    const panel = await rect(page, ".control-panel");
    const card = await rect(page, ".identity-card");

    within(app.width, 1278, 1280, "app width");
    within(app.height, 798, 800, "app height");
    within(menubar.height, 29, 31, "menubar height");
    within(tabs.height, 23, 25, "main tab row height");
    within(subbar.height, 18, 20, "subbar height");
    assert(workspace.y >= 72 && workspace.y <= 75, `workspace top should sit under chrome, got ${workspace.y}`);
    within(panel.width, 300, 330, "right control panel width");
    assert(panel.right <= 1278 && panel.right >= 1248, `right control panel should hug the app edge, got ${panel.right}`);
    assert(canvas.x <= 8 && canvas.y <= 82, `chart canvas should start at the top-left paper area, got ${JSON.stringify(canvas)}`);
    assert(canvas.width > panel.width * 2, `chart canvas should keep the desktop chart dominant, got ${canvas.width}`);
    assert(card.width <= panel.width && card.height <= 112, `identity card should stay compact, got ${JSON.stringify(card)}`);

    const imageProbe = await page.locator("#chartImage").evaluate((img) => ({
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      hidden: img.hidden,
      clientWidth: Math.round(img.getBoundingClientRect().width),
      clientHeight: Math.round(img.getBoundingClientRect().height),
      devicePixelRatio: Math.max(1, window.devicePixelRatio || 1),
      objectPosition: getComputedStyle(img).objectPosition
    }));
    assert(!imageProbe.hidden, "chart image is hidden");
    assert(imageProbe.naturalWidth >= 900 && imageProbe.naturalHeight >= 600,
      `chart image payload too small: ${imageProbe.naturalWidth}x${imageProbe.naturalHeight}`);
    assert(imageProbe.objectPosition === "0% 0%" || imageProbe.objectPosition === "left top",
      `chart image should be left/top aligned, got ${imageProbe.objectPosition}`);
    assert(imageProbe.naturalWidth >= Math.round(imageProbe.clientWidth * imageProbe.devicePixelRatio * 0.9),
      `chart image should be generated near display density, got ${JSON.stringify(imageProbe)}`);
    assert(imageProbe.naturalHeight >= Math.round(imageProbe.clientHeight * imageProbe.devicePixelRatio * 0.9),
      `chart image should be generated near display density, got ${JSON.stringify(imageProbe)}`);

    await page.locator("details.menu").nth(3).locator(":scope > summary").click();
    await page.locator("details.menu:nth-of-type(4) details.menu-cascade").nth(0).locator("summary").hover();
    const optionPanel = await rect(page, "details.menu:nth-of-type(4) > .menu-panel");
    const optionText = await page.locator("details.menu:nth-of-type(4) > .menu-panel").innerText();
    const optionOverflow = await page.locator("details.menu:nth-of-type(4) > .menu-panel").evaluate((panel) => ({
      clientHeight: panel.clientHeight,
      scrollHeight: panel.scrollHeight,
      bottom: Math.round(panel.getBoundingClientRect().bottom)
    }));
    const submenu = await rect(page, "details.menu:nth-of-type(4) .menu-subpanel:visible");
    assert(optionPanel.width >= 248, `options panel too narrow: ${optionPanel.width}`);
    assert(optionOverflow.bottom <= 800, `options panel should fit the desktop viewport, got ${JSON.stringify(optionOverflow)}`);
    assert(optionOverflow.scrollHeight <= optionOverflow.clientHeight + 2,
      `options panel should not require scrolling at desktop size, got ${JSON.stringify(optionOverflow)}`);
    [
      "選擇星盤(&M)...",
      "顯示流年(&N)",
      "修正時間(&T)...",
      "項目顯示",
      "工具列顯示",
      "選擇星曜(&I)...",
      "選擇角距顯示(&O)...",
      "字形方向設定(&V)...",
      "色彩設定(&C)...",
      "選項還原 (須重新啟動)(&R)"
    ].forEach((label) => {
      assert(optionText.includes(label), `Options menu missing ${label}`);
    });
    assert(submenu.x >= optionPanel.right - 10, `submenu should open to the right, got ${JSON.stringify({ optionPanel, submenu })}`);
    assert(submenu.right <= 1280, `submenu clipped beyond viewport: ${submenu.right}`);
    assert(submenu.width >= 188 && submenu.height >= 64, `submenu size looks wrong: ${JSON.stringify(submenu)}`);

    await page.locator("details.menu:nth-of-type(4) > .menu-panel").getByText("色彩設定").click();
    await page.locator("#optionDialog[open]").waitFor({ state: "visible", timeout: 3000 });
    assert(await page.locator("#optionDialogTitle").innerText() === "色彩設定", "Color settings dialog did not open");
    await page.locator("#optionDialog").getByText("Cancel").click();

    await page.locator("details.menu").nth(3).locator(":scope > summary").click();
    await page.locator("details.menu:nth-of-type(4) details.menu-cascade").nth(2).locator("summary").hover();
    const eightToggle = page.locator("details.menu:nth-of-type(4) .menu-subpanel:visible").getByText("四柱八字");
    await eightToggle.click();
    assert(await page.locator(".main-tabs .tab[data-view='eight']").isHidden(),
      "項目顯示 should hide the 八字 tab immediately");
    await page.locator("details.menu").nth(3).locator(":scope > summary").click();
    await page.locator("details.menu:nth-of-type(4) details.menu-cascade").nth(2).locator("summary").hover();
    await page.locator("details.menu:nth-of-type(4) .menu-subpanel:visible").getByText("四柱八字").click();
    assert(await page.locator(".main-tabs .tab[data-view='eight']").isVisible(),
      "項目顯示 should restore the 八字 tab immediately");

    await page.locator("details.menu").nth(4).locator(":scope > summary").click();
    await page.locator("details.menu:nth-of-type(5) > .menu-panel").getByText("流年星法").click();
    await page.locator("#optionDialog[open]").waitFor({ state: "visible", timeout: 3000 });
    assert(await page.locator("#optionDialogTitle").innerText() === "流年星法", "Search dialog did not open");
    await page.locator("#optionDialogOk").click();
    await page.locator("#calculationView.active #resultBox").waitFor({ state: "visible", timeout: 15000 });
    assert((await page.locator("#resultBox").innerText()).includes("流年星法"),
      "Search OK should render a real result page");

    await page.locator("details.menu").nth(5).locator(":scope > summary").click();
    await page.locator("details.menu:nth-of-type(6) > .menu-panel").getByText("星盘").click();
    await page.locator("#chartView.active #chartImage:not([hidden])").waitFor({ state: "visible", timeout: 20000 });
    const postMenuImageProbe = await page.locator("#chartImage").evaluate((img) => ({
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      clientWidth: Math.round(img.getBoundingClientRect().width),
      clientHeight: Math.round(img.getBoundingClientRect().height),
      devicePixelRatio: Math.max(1, window.devicePixelRatio || 1)
    }));
    assert(postMenuImageProbe.naturalWidth >= Math.round(postMenuImageProbe.clientWidth * postMenuImageProbe.devicePixelRatio * 0.85),
      `returning to chart from a menu page should not leave a low-res image: ${JSON.stringify(postMenuImageProbe)}`);
    assert(postMenuImageProbe.naturalHeight >= Math.round(postMenuImageProbe.clientHeight * postMenuImageProbe.devicePixelRatio * 0.85),
      `returning to chart from a menu page should not leave a low-res image: ${JSON.stringify(postMenuImageProbe)}`);

    await page.locator("details.menu").nth(1).locator(":scope > summary").click();
    await page.locator("details.menu:nth-of-type(2) > .menu-panel").getByText("新增").click();
    await page.locator("#chartView.active #chartImage:not([hidden])").waitFor({ state: "visible", timeout: 20000 });
    assert(await page.locator("input[name='name']").inputValue() === "",
      "File > 新增 should blank the current entry instead of adding a management row");

    await page.locator("details.menu").nth(3).locator(":scope > summary").click();
    await page.locator("details.menu:nth-of-type(4) details.menu-cascade").nth(0).locator("summary").hover();
    await page.locator("details.menu:nth-of-type(4) .menu-subpanel:visible").getByText("占星盤").click();
    const modeAfterMenu = await page.locator("input[name='mode']").inputValue();
    assert(modeAfterMenu === "western", `選擇星盤 > 占星盤 should update mode, got ${modeAfterMenu}`);
    await page.waitForTimeout(800);

    await page.locator("details.menu").nth(3).locator(":scope > summary").click();
    await page.locator("details.menu:nth-of-type(4) > .menu-panel").getByText("選擇星曜(&I)...").click();
    await page.locator("#optionDialog[open]").waitFor({ state: "visible", timeout: 3000 });
    assert((await page.locator("#optionDialogBody").innerText()).includes("強勢角距"),
      "Western planet dialog should expose strength influence controls");
    const chironCheckbox = page.locator("#optionDialog label", { hasText: "凱" }).locator("input[type='checkbox']").first();
    await chironCheckbox.check();
    const transitMoonCheckbox = page
      .locator("#optionDialog fieldset", { hasText: "流年納入計算" })
      .locator("label", { hasText: "月" })
      .locator("input[type='checkbox']")
      .first();
    await transitMoonCheckbox.check();
    const planetRequest = page.waitForRequest((request) => (
      request.method() === "POST"
      && request.url().includes("/api/chart/compute")
      && (request.postData() || "").includes("astroSignDisplay")
    ), { timeout: 15000 });
    await page.locator("#optionDialogOk").click();
    const planetPayload = JSON.parse((await planetRequest).postData() || "{}");
    const astroDisplay = String(planetPayload.astroSignDisplay || "").split(",");
    const transitDisplay = String(planetPayload.transitSignDisplay || "").split(",");
    assert(astroDisplay[17] === "1",
      `選擇星曜 should include checked Chiron in astro_sign_display, got ${planetPayload.astroSignDisplay}`);
    assert(transitDisplay[1] === "1",
      `流年納入計算 should include checked Moon in transit_sign_display, got ${planetPayload.transitSignDisplay}`);
    assert(planetPayload.trueAsNorth !== undefined && planetPayload.nightFortuneMode !== undefined,
      "Planet dialog should send node and fortune preferences to the backend");
    assert(computePayloads.some((payload) => String(payload.astroSignDisplay || "").split(",")[17] === "1"),
      "Captured compute requests should include the updated astrology planet list");

    await page.keyboard.press("Escape");
    await page.locator(".main-tabs .tab[data-view='manage']").click();
    const manageTable = await rect(page, "#manageView table");
    const manageHeaders = await page.locator("#manageView thead").innerText();
    assert(/[名]?[稱称]/.test(manageHeaders) && /出生[時时]間/.test(manageHeaders),
      `manage table headers should be visible, got ${manageHeaders}`);
    assert(manageTable.width >= 1100, `manage table should span the desktop-style page, got ${manageTable.width}`);

    await page.locator("details.menu").nth(3).locator(":scope > summary").click();
    await page.locator("details.menu:nth-of-type(4) details.menu-cascade").nth(3).locator("summary").hover();
    await page.locator("details.menu:nth-of-type(4) .menu-subpanel:visible").getByText("檔案圖示").click();
    assert(await page.locator("#importMri").isHidden() && await page.locator("#exportMri").isHidden(),
      "工具列顯示 > 檔案圖示 should hide file toolbar buttons in management view");
    assert(await page.locator("#saveEntry").isVisible(),
      "工具列顯示 > 檔案圖示 should not hide edit toolbar buttons");
    await page.locator("details.menu").nth(3).locator(":scope > summary").click();
    await page.locator("details.menu:nth-of-type(4) details.menu-cascade").nth(3).locator("summary").hover();
    await page.locator("details.menu:nth-of-type(4) .menu-subpanel:visible").getByText("檔案圖示").click();
    assert(await page.locator("#importMri").isVisible() && await page.locator("#exportMri").isVisible(),
      "工具列顯示 > 檔案圖示 should restore file toolbar buttons");

    await page.locator("details.menu").nth(5).locator(":scope > summary").click();
    const highResRequest = page.waitForRequest((request) => {
      if (request.method() !== "POST" || !request.url().includes("/api/chart/compute")) {
        return false;
      }
      try {
        return Number(JSON.parse(request.postData() || "{}").imageZoom) >= 200;
      } catch {
        return false;
      }
    }, { timeout: 15000 });
    await page.locator("details.menu:nth-of-type(6) > .menu-panel").getByText("高解析度使用者介面").click();
    await highResRequest;
    assert(await page.locator("body.high-resolution-ui").count() === 1,
      "檢視 > 高解析度使用者介面 should update body state and trigger a high-density chart request");

    console.log(`UI layout check passed for ${baseUrl}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
