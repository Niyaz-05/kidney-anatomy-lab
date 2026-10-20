import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

const SHOTS = 'docs/screenshots';
fs.mkdirSync(SHOTS, { recursive: true });

async function open(page: Page, query = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`/${query}`);
  return errors;
}
async function ready(page: Page) {
  await expect(page.locator('.viewer[data-ready="true"]')).toBeVisible({ timeout: 90_000 });
  await settle(page);
}
/** Waits until the canvas has rendered two more frames (software WebGL can be slow to compile shaders). */
async function settle(page: Page, ms = 1000) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(ms);
}
const detailTitle = (page: Page) => page.locator('#detail-title');
const listButton = (page: Page, name: string | RegExp) => page.locator('.struct-list button', { hasText: name });
const radio = (page: Page, name: string) => page.getByRole('radio', { name, exact: true });
const mode = (page: Page, name: string) => page.locator('nav[aria-label="Mode"] button', { hasText: new RegExp(`^${name}$`) }).click();
const cameraButton = (page: Page, name: string) => page.locator('[aria-label="Camera views"] button', { hasText: new RegExp(`^${name}$`) });
const slider = (page: Page, name: RegExp) => page.getByRole('slider', { name });

test('loads the urinary system without console errors and with a clean main screen', async ({ page }) => {
  const errors = await open(page);
  await ready(page);
  await expect(page.getByRole('heading', { name: 'Kidney & Urinary System', level: 1 })).toBeVisible();
  await expect(page.locator('aside.right')).toHaveCount(0);
  await expect(radio(page, 'Real')).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: `${SHOTS}/01-initial.png` });
  expect(errors).toEqual([]);
});

test('clicking the model selects the structure under the pointer', async ({ page }) => {
  await open(page);
  await ready(page);
  const box = (await page.locator('.viewer canvas').boundingBox())!;
  // The free area between the panels: its centre is the spine and great vessels.
  await page.mouse.click(box.x + 318 + (box.width - 318) / 2, box.y + 70 + (box.height - 150) / 2);
  await expect(detailTitle(page)).toHaveText(/./);
  await expect(page.locator('aside.right')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/02-selected.png` });
});

test('search finds structures by name and synonym', async ({ page }) => {
  await open(page);
  await ready(page);
  const search = page.getByLabel('Search structures');
  await search.fill('calyx');
  await search.press('Enter');
  await expect(detailTitle(page)).toHaveText('Left minor calyces');
  await search.fill('IVC');
  await expect(page.locator('.search-results')).toContainText('Inferior vena cava');
  await search.fill('suprarenal gland');
  await expect(page.locator('.search-results')).toContainText('adrenal gland');
  await search.fill('zzzz');
  await expect(page.getByText('No structure matches')).toBeVisible();
  await search.press('Escape');
  await expect(page.locator('fieldset.layers')).toBeVisible();
});

test('a group lists its parts and a part links back to its group', async ({ page }) => {
  await open(page);
  await ready(page);
  await listButton(page, /^Left kidney$/).click();
  await expect(detailTitle(page)).toHaveText('Left kidney');
  await expect(page.locator('aside.right')).toContainText('6 parts');
  await page.locator('aside.right .chips button', { hasText: 'Left renal pyramids' }).click();
  await expect(detailTitle(page)).toHaveText('Left renal pyramids');
  await expect(page.locator('aside.right')).toContainText('11 pyramids');
  await page.locator('aside.right .chip-row button', { hasText: 'Left kidney' }).click();
  await expect(detailTitle(page)).toHaveText('Left kidney');
});

test('colour by layer paints each layer', async ({ page }) => {
  await open(page);
  await ready(page);
  const canvas = page.locator('.viewer canvas');
  const real = await canvas.screenshot();
  await radio(page, 'Layers').click();
  await settle(page);
  expect(Buffer.compare(real, await canvas.screenshot())).not.toBe(0);
  await page.screenshot({ path: `${SHOTS}/03-colour-layers.png` });
});

test('layers hide and show structures; the nearby organs can be shown', async ({ page }) => {
  await open(page);
  await ready(page);
  await expect(listButton(page, /^Liver/).locator('.tag')).toHaveText('hidden');
  await page.getByLabel('Nearby organs').check();
  await expect(listButton(page, /^Liver/).locator('.tag')).toHaveCount(0);
  await page.getByLabel('Ureters').uncheck();
  await expect(listButton(page, /^Left ureter(hidden)?$/).locator('.tag')).toHaveText('hidden');
  await settle(page);
  await page.screenshot({ path: `${SHOTS}/04-nearby-organs.png` });
});

test('isolate, zoom and reset', async ({ page }) => {
  await open(page);
  await ready(page);
  await listButton(page, /^Left renal pelvis$/).click();
  await page.getByLabel('Isolate').check();
  await expect(listButton(page, /^Left renal capsule/).locator('.tag')).toHaveText('hidden');
  await page.getByRole('button', { name: 'Zoom to' }).click();
  await settle(page);
  await page.screenshot({ path: `${SHOTS}/05-isolated-pelvis.png` });
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(detailTitle(page)).toHaveCount(0);
  await expect(listButton(page, /^Left renal capsule/).locator('.tag')).toHaveCount(0);
});

test('camera presets switch views', async ({ page }) => {
  await open(page);
  await ready(page);
  const canvas = page.locator('.viewer canvas');
  const first = await canvas.screenshot();
  await cameraButton(page, 'Back').click();
  await settle(page, 1200);
  expect(Buffer.compare(first, await canvas.screenshot())).not.toBe(0);
  await page.screenshot({ path: `${SHOTS}/06-from-behind.png` });
});

test('labels mode shows non-overlapping labels', async ({ page }) => {
  await open(page);
  await ready(page);
  await page.getByLabel('Labels').check();
  await settle(page, 1500);
  const shown = page.locator('.scene-label[data-state="shown"]');
  expect(await shown.count()).toBeGreaterThanOrEqual(3);
  const boxes = await shown.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => [r.left, r.top, r.right, r.bottom]));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const [a, b] = [boxes[i]!, boxes[j]!];
    expect(!(a[2]! <= b[0]! || b[2]! <= a[0]! || a[3]! <= b[1]! || b[3]! <= a[1]!), `labels ${i} and ${j} overlap`).toBe(false);
  }
  await page.screenshot({ path: `${SHOTS}/07-labels.png` });
});

test('the cut opens the kidneys, faces the camera to it, and can be flipped and turned off', async ({ page }) => {
  const errors = await open(page);
  await ready(page);
  const canvas = page.locator('.viewer canvas');
  const whole = await canvas.screenshot();
  await radio(page, 'Front').click();
  await expect(cameraButton(page, 'Front')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.slice-hint')).toHaveText('Showing the back half');
  await settle(page, 2500);
  expect(Buffer.compare(whole, await canvas.screenshot())).not.toBe(0);
  await page.screenshot({ path: `${SHOTS}/08-cut-frontal.png` });
  await page.getByRole('button', { name: 'Flip' }).click();
  await expect(cameraButton(page, 'Back')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.slice-hint')).toHaveText('Showing the front half');
  await radio(page, 'Side').click();
  await expect(page.locator('.slice-hint')).toHaveText('Showing the left side of the body');
  await radio(page, 'Off').click();
  await expect(page.getByLabel('Cut position')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Blood: the kidneys open and blood flows through them', async ({ page }) => {
  const errors = await open(page);
  await ready(page);
  await mode(page, 'Blood');
  const panel = page.locator('.blood-panel');
  await expect(panel).toContainText('Interlobar arteries');
  await expect(page.locator('.slice-hint')).toHaveText('Showing the back half');
  await settle(page, 2500);
  await page.screenshot({ path: `${SHOTS}/09-blood.png` });
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Nephron: each part explains what it does', async ({ page }) => {
  const errors = await open(page);
  await ready(page);
  await mode(page, 'Nephron');
  const panel = page.locator('.nephron-panel');
  await expect(panel.locator('.osm-chart')).toBeVisible();
  await settle(page, 2500);
  await page.screenshot({ path: `${SHOTS}/10-nephron.png` });
  await panel.getByRole('button', { name: 'Thick ascending limb' }).click();
  await expect(panel.locator('[data-segment]')).toHaveAttribute('data-segment', 'thick-ascending');
  await expect(panel.locator('[data-segment]')).toContainText('loop diuretics');
  await panel.getByRole('button', { name: 'Collecting duct' }).click();
  await expect(panel.locator('[data-segment]')).toContainText('aquaporin-2');
  expect(errors).toEqual([]);
});

test('Filtering: Starling forces, low blood pressure, ADH and glucose', async ({ page }) => {
  test.slow();
  const errors = await open(page);
  await ready(page);
  await mode(page, 'Filtering');
  const panel = page.locator('.filtering-panel');
  await expect(panel.locator('[data-nfp]')).toHaveAttribute('data-nfp', '10.00');
  expect(Number(await panel.locator('[data-gfr]').getAttribute('data-gfr'))).toBeCloseTo(125, 0);
  await settle(page, 2500);
  await page.screenshot({ path: `${SHOTS}/11-filtering.png` });
  await slider(page, /Mean blood pressure/).fill('60');
  await expect.poll(async () => Number(await panel.locator('[data-gfr]').getAttribute('data-gfr'))).toBeLessThan(30);
  await expect(panel).toContainText('below its range');
  await slider(page, /Mean blood pressure/).fill('150');
  expect(Number(await panel.locator('[data-gfr]').getAttribute('data-gfr'))).toBeCloseTo(125, 0);
  await slider(page, /Water taken in/).fill('1');
  await expect(panel.locator('[data-urine]')).toHaveAttribute('data-urine', '0.50');
  await expect(panel).toContainText('drying out');
  await slider(page, /Blood glucose/).fill('250');
  await expect(panel.locator('[data-glucosuria]')).toHaveAttribute('data-glucosuria', 'yes');
  await panel.getByRole('button', { name: 'Reset' }).click();
  await expect(panel.locator('[data-glucosuria]')).toHaveAttribute('data-glucosuria', 'no');
  expect(errors).toEqual([]);
});

test('Urine: the bladder fills, signals the urge and empties', async ({ page }) => {
  test.slow();
  const errors = await open(page);
  await ready(page);
  await mode(page, 'Urine');
  const panel = page.locator('.urine-panel');
  await expect(panel.locator('[data-waves]')).toHaveAttribute('data-waves', /^[2-6]\./);
  await panel.getByRole('button', { name: 'Fill to 400 mL' }).click();
  await expect(panel).toContainText('strong urge');
  await settle(page, 2000);
  await page.screenshot({ path: `${SHOTS}/12-urine-full.png` });
  await panel.getByRole('button', { name: 'Empty the bladder' }).click();
  await expect(panel).toContainText('emptying');
  await expect.poll(async () => Number(await panel.locator('[data-ml]').getAttribute('data-ml')), { timeout: 60_000 }).toBeLessThan(60);
  expect(errors).toEqual([]);
});

test('Stones: where a stone stops depends on its size', async ({ page }) => {
  const errors = await open(page);
  await ready(page);
  await mode(page, 'Stones');
  const panel = page.locator('.stones-panel');
  await panel.getByRole('button', { name: '7 mm' }).click();
  await expect(panel.locator('[data-stops]')).toHaveAttribute('data-stops', 'vuj');
  await expect(panel).toContainText('47 %');
  await settle(page, 3000);
  await page.screenshot({ path: `${SHOTS}/13-stone.png` });
  await panel.getByRole('button', { name: '12 mm' }).click();
  await expect(panel.locator('[data-stops]')).toHaveAttribute('data-stops', 'puj');
  await panel.getByRole('button', { name: '4 mm' }).click();
  await expect(panel.locator('[data-stops]')).toHaveAttribute('data-stops', 'bladder');
  expect(errors).toEqual([]);
});

test('Kidney test: eGFR from creatinine, age and sex', async ({ page }) => {
  await open(page);
  await ready(page);
  await mode(page, 'Kidney test');
  const panel = page.locator('.function-panel');
  await expect(panel.locator('[data-egfr]')).toContainText('eGFR 95');
  await page.getByLabel('Creatinine in mg/dL').fill('2.5');
  await expect(panel.locator('[data-egfr]')).toContainText('stage G4');
  await page.getByLabel('Unit').selectOption('µmol/L');
  await expect(page.getByLabel('Creatinine in µmol/L')).toHaveValue('221');
  await expect(panel.locator('[data-egfr]')).toContainText('stage G4');
  await radio(page, 'Male').click();
  await expect(panel.locator('[data-egfr]')).toHaveAttribute('data-egfr', '32.5'); // 142 × (2.5/0.9)^−1.2 × 0.9938^40
  await page.screenshot({ path: `${SHOTS}/14-egfr.png` });
});

test('Hormones: step through ADH', async ({ page }) => {
  const errors = await open(page);
  await ready(page);
  await mode(page, 'Hormones');
  const panel = page.locator('.hormones-panel');
  await radio(page, 'ADH').click();
  await expect(panel).toContainText('hypothalamus');
  await panel.getByRole('button', { name: 'Next step' }).click();
  await expect(panel).toContainText('posterior pituitary');
  await radio(page, 'Renin–angiotensin–aldosterone').click();
  for (let i = 0; i < 5; i++) await panel.getByRole('button', { name: 'Next step' }).click();
  await expect(panel).toContainText('adrenal cortex release aldosterone');
  await settle(page, 1500);
  await page.screenshot({ path: `${SHOTS}/15-hormones.png` });
  expect(errors).toEqual([]);
});

test('guided tour navigates forward, back, and finishes', async ({ page }) => {
  test.slow();
  await open(page);
  await ready(page);
  await mode(page, 'Guided tour');
  await expect(page.getByText(/step 1 of 14/)).toBeVisible();
  await expect(page.locator('#tour-title')).toHaveText('The urinary system');
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Next →' }).click();
  await expect(page.locator('#tour-title')).toHaveText('Blood in');
  await settle(page, 2500);
  await page.screenshot({ path: `${SHOTS}/16-tour-blood.png` });
  await page.getByRole('button', { name: '← Back' }).click();
  await expect(page.getByText(/step 4 of 14/)).toBeVisible();
  await page.locator('.tour-index button').last().click();
  await expect(page.getByText(/step 14 of 14/)).toBeVisible();
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByRole('button', { name: 'Anatomy' })).toHaveAttribute('aria-pressed', 'true');
});

test('phone layout: structures open from the dock and details follow a pick', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await ready(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.locator('aside.left')).toBeHidden();
  await page.getByRole('button', { name: 'Structures' }).click();
  await listButton(page, /^Left renal pelvis$/).click();
  await expect(page.locator('aside.left')).toBeHidden();
  await expect(detailTitle(page)).toHaveText('Left renal pelvis');
  await page.screenshot({ path: `${SHOTS}/17-phone.png` });
});

test('the About sheet holds the HuBMAP and BodyParts3D credits', async ({ page }) => {
  await open(page);
  await ready(page);
  await page.getByRole('button', { name: /About this lab/ }).click();
  const dialog = page.getByRole('dialog', { name: 'About this lab' });
  await expect(dialog).toContainText('HuBMAP');
  await expect(dialog).toContainText('BodyParts3D');
  await expect(dialog).toContainText('Starling forces');
  await expect(dialog).toContainText('CKD-EPI 2021');
  await expect(dialog).toContainText('CC Attribution 4.0');
  await page.screenshot({ path: `${SHOTS}/18-about.png` });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('without WebGL the learning content still works', async ({ page }) => {
  await open(page, '?nowebgl');
  await expect(page.getByRole('heading', { name: '3D view unavailable' })).toBeVisible();
  await listButton(page, /^Left renal pelvis$/).click();
  await expect(detailTitle(page)).toHaveText('Left renal pelvis');
  await mode(page, 'Kidney test');
  await expect(page.locator('.function-panel [data-egfr]')).toContainText('eGFR 95');
});

test('a missing model shows an error with a working retry', async ({ page }) => {
  let fail = true;
  await page.route('**/models/kidney.glb', (route) => (fail ? route.fulfill({ status: 404, body: 'not found' }) : route.continue()));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('The 3D model could not be loaded');
  fail = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await ready(page);
});

test('reduced motion: the blood, urine and nephron views work without errors', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1366, height: 820 } });
  const page = await context.newPage();
  const errors = await open(page);
  await ready(page);
  for (const m of ['Blood', 'Urine', 'Nephron']) { await mode(page, m); await settle(page, 800); }
  expect(errors).toEqual([]);
  await context.close();
});
