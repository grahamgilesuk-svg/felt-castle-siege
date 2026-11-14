'use strict';

const fs = require('fs');
const path = require('path');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  try {
    ({ chromium } = require('playwright-core'));
  } catch (e2) {
    console.error('Playwright is not installed. Run: npm install playwright');
    process.exit(1);
  }
}

const htmlPath = path.join(__dirname, 'felt_castle_siege.html');
const url = 'file://' + htmlPath;

const executablePath = process.env.CHROMIUM_PATH || '/usr/bin/chromium';

async function main() {
  let browser;
  try {
    browser = await chromium.launch({
      executablePath,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
  } catch (e) {
    console.error('Chromium failed to start: ' + e.message);
    console.error('Set CHROMIUM_PATH to a working Chromium executable and retry.');
    process.exit(1);
  }

  let failed = 0;
  function report(name, error) {
    if (error) {
      failed++;
      console.log('FAIL ' + name + ' — ' + error.message);
    } else {
      console.log('PASS ' + name);
    }
  }

  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await desktop.goto(url);
    await desktop.waitForTimeout(500);
    const title = await desktop.title();
    if (!/Felt Castle Siege/.test(title)) throw new Error('unexpected title: ' + title);
    const shots = await desktop.textContent('#shot-count');
    if (shots.trim() !== '3') throw new Error('shots display wrong: ' + shots);
    await desktop.screenshot({ path: path.join(__dirname, 'screenshot-desktop.png') });
    report('desktop: page loads and HUD renders');
  } catch (e) {
    report('desktop: page loads and HUD renders', e);
  }

  try {
    await desktop.click('#angle-slider');
    await desktop.fill('#angle-slider', '10');
    await desktop.dispatchEvent('#angle-slider', 'input');
    await desktop.fill('#power-slider', '80');
    await desktop.dispatchEvent('#power-slider', 'input');
    await desktop.click('#launch-btn');
    await desktop.waitForFunction(() => window.FeltSiege.snapshot().state === 'FLYING', null, { timeout: 3000 });
    await desktop.waitForFunction(() => window.FeltSiege.snapshot().state !== 'FLYING', null, { timeout: 20000 });
    const state = await desktop.evaluate(() => window.FeltSiege.snapshot().state);
    if (state !== 'WON') throw new Error('expected WON after a standard shot, saw ' + state);
    await desktop.waitForFunction(() => document.getElementById('result-dialog').open, null, { timeout: 5000 });
    await desktop.screenshot({ path: path.join(__dirname, 'screenshot-desktop-win.png') });
    report('desktop: standard shot wins and dialog appears');
  } catch (e) {
    report('desktop: standard shot wins and dialog appears', e);
  }

  try {
    const dialogVisible = await desktop.isVisible('#result-dialog');
    if (!dialogVisible) throw new Error('result dialog not visible');
    await desktop.click('#result-close');
    const snap = await desktop.evaluate(() => window.FeltSiege.snapshot());
    if (snap.roundOver !== true) throw new Error('round-over prompt not armed after closing');
    const status = await desktop.textContent('#status-text');
    if (!/Round over/.test(status)) throw new Error('status does not explain how to continue: ' + status);
    report('desktop: closing the dialog arms the round-over prompt');
  } catch (e) {
    report('desktop: closing the dialog arms the round-over prompt', e);
  }

  try {
    await desktop.mouse.click(640, 300);
    await desktop.waitForFunction(() => window.FeltSiege.snapshot().state === 'READY', null, { timeout: 3000 });
    const after = await desktop.evaluate(() => window.FeltSiege.snapshot());
    if (after.roundOver !== false) throw new Error('prompt not cleared on restart');
    if (after.shots !== 3) throw new Error('restart did not restore three shots');
    report('desktop: tapping the scene restarts the round');
  } catch (e) {
    report('desktop: tapping the scene restarts the round', e);
  }

  try {
    await desktop.click('#inspector-toggle');
    await desktop.waitForTimeout(300);
    const listing = await desktop.textContent('#inspector-components');
    if (!/DragBlock/.test(listing) || !/GameHUD/.test(listing)) {
      throw new Error('inspector component list incomplete');
    }
    report('desktop: inspector opens with component list');
  } catch (e) {
    report('desktop: inspector opens with component list', e);
  }

  try {
    await desktop.click('#pause-btn');
    const paused = await desktop.evaluate(() => window.FeltSiege.snapshot().paused);
    if (paused !== true) throw new Error('pause flag not set');
    await desktop.click('#pause-btn');
    report('desktop: pause toggles');
  } catch (e) {
    report('desktop: pause toggles', e);
  }

  try {
    await desktop.fill('#angle-slider', '80');
    await desktop.dispatchEvent('#angle-slider', 'input');
    await desktop.fill('#power-slider', '100');
    await desktop.dispatchEvent('#power-slider', 'input');
    await desktop.click('#launch-btn');
    await desktop.waitForFunction(() => window.FeltSiege.snapshot().state === 'FLYING', null, { timeout: 3000 });
    const zoomed = await desktop.waitForFunction(() => window.FeltSiege.snapshot().camScale < 0.95, null, { timeout: 6000 })
      .then(() => true).catch(() => false);
    if (!zoomed) throw new Error('camera never zoomed out during a high shot');
    await desktop.screenshot({ path: path.join(__dirname, 'screenshot-camera.png') });
    await desktop.waitForFunction(() => window.FeltSiege.snapshot().state !== 'FLYING', null, { timeout: 20000 });
    await desktop.waitForFunction(() => window.FeltSiege.snapshot().camScale === 1, null, { timeout: 6000 });
    report('desktop: flight camera follows the boulder and returns');
  } catch (e) {
    report('desktop: flight camera follows the boulder and returns', e);
  }

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  try {
    await mobile.goto(url);
    await mobile.waitForTimeout(500);
    const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    if (overflow) throw new Error('horizontal overflow on narrow viewport');
    await mobile.screenshot({ path: path.join(__dirname, 'screenshot-mobile.png'), fullPage: true });
    report('mobile: narrow layout without horizontal overflow');
  } catch (e) {
    report('mobile: narrow layout without horizontal overflow', e);
  }

  try {
    const box = await mobile.locator('#launch-btn').boundingBox();
    if (!box || box.height < 44) throw new Error('launch button smaller than 44 CSS px');
    report('mobile: controls meet 44px touch target');
  } catch (e) {
    report('mobile: controls meet 44px touch target', e);
  }

  await browser.close();
  console.log('');
  console.log('Browser checks finished with ' + failed + ' failure(s).');
  console.log('Screenshots are written next to this script for visual inspection.');
  process.exit(failed ? 1 : 0);
}

main();
