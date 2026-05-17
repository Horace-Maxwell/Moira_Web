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
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      messages.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => messages.push(`pageerror: ${error.message}`));

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.locator("#chartImage:not([hidden])").waitFor({ state: "visible", timeout: 20000 });

    assert(await page.title() === "七政四餘星盤 - Moira", "Unexpected page title");
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

    await page.locator("details.menu").nth(4).locator(":scope > summary").click();
    await page.locator("details.menu:nth-of-type(5) > .menu-panel").getByText("流年星法").click();
    await page.locator("#optionDialog[open]").waitFor({ state: "visible", timeout: 3000 });
    assert(await page.locator("#optionDialogTitle").innerText() === "流年星法", "Search dialog did not open");
    await page.locator("#optionDialog").getByText("Cancel").click();

    await page.keyboard.press("Escape");
    await page.locator(".main-tabs .tab[data-view='manage']").click();
    const manageTable = await rect(page, "#manageView table");
    const manageHeaders = await page.locator("#manageView thead").innerText();
    assert(/[名]?[稱称]/.test(manageHeaders) && /出生[時时]間/.test(manageHeaders),
      `manage table headers should be visible, got ${manageHeaders}`);
    assert(manageTable.width >= 1100, `manage table should span the desktop-style page, got ${manageTable.width}`);

    console.log(`UI layout check passed for ${baseUrl}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
