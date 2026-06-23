const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3456';
const OUT = '/tmp/screenshots';
fs.mkdirSync(OUT, { recursive: true });

async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1600,900'],
    defaultViewport: { width: 1600, height: 900 }
  });
  const page = await browser.newPage();

  // Capture console errors
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

  console.log('=== 1. Load /floor-plan ===');
  await page.goto(`${BASE}/floor-plan`, { waitUntil: 'networkidle2', timeout: 30000 });
  await shot(page, '01-initial-load');
  console.log('Page loaded, errors so far:', errors.length);

  // Check key elements exist
  const canvasEl = await page.$('canvas');
  console.log('Canvas present:', !!canvasEl);
  
  const toolbar = await page.$eval('body', el => el.innerText);
  console.log('Has "Wall" tool text:', toolbar.includes('Wall') || toolbar.includes('wall'));

  await shot(page, '02-full-layout');

  console.log('\n=== 2. Drawing workflow ===');
  // Find the 2D canvas (first canvas = three.js might conflict; look for the drawing one)
  const canvases = await page.$$('canvas');
  console.log('Canvas count:', canvases.length);

  // Click in the 2D drawing canvas area (centre-left region)
  const canvas2D = canvases[0]; // drawing canvas
  const box = await canvas2D.boundingBox();
  console.log('Canvas 0 box:', JSON.stringify(box));

  if (canvases.length > 1) {
    const box1 = await canvases[1].boundingBox();
    console.log('Canvas 1 box:', JSON.stringify(box1));
  }

  // Click the canvas to start drawing
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.click(cx, cy);
  await new Promise(r => setTimeout(r, 500));
  await shot(page, '03-after-first-click');
  
  // Check keyboard input panel appeared
  const bodyText = await page.$eval('body', el => el.innerText);
  console.log('Length input appeared:', bodyText.includes('Length') || bodyText.includes('length'));
  console.log('Direction buttons visible:', bodyText.includes('Direction') || bodyText.includes('North'));

  console.log('\n=== 3. Keyboard measurement input ===');
  // Type a length
  await page.keyboard.type('5');
  await new Promise(r => setTimeout(r, 200));
  await shot(page, '04-typed-length-5');
  
  // Press right arrow to commit wall east
  await page.keyboard.press('ArrowRight');
  await new Promise(r => setTimeout(r, 300));
  await shot(page, '05-after-arrow-right');

  // Draw a few more walls (up, left, close shape)
  await page.keyboard.type('4');
  await page.keyboard.press('ArrowUp');
  await new Promise(r => setTimeout(r, 200));
  
  await page.keyboard.type('5');
  await page.keyboard.press('ArrowLeft');
  await new Promise(r => setTimeout(r, 200));

  await page.keyboard.type('4');
  await page.keyboard.press('ArrowDown');
  await new Promise(r => setTimeout(r, 200));
  
  await shot(page, '06-four-walls-drawn');
  
  // Check for Close Shape button
  const closeBtn = await page.$('button');
  const allButtons = await page.$$eval('button', btns => btns.map(b => b.textContent?.trim()));
  console.log('Buttons visible:', allButtons.filter(t => t && t.length < 40));
  const hasCloseShape = allButtons.some(t => t && t.toLowerCase().includes('close'));
  console.log('Close Shape button present:', hasCloseShape);

  // Click Close Shape
  const closeShapeBtn = await page.evaluateHandle(() => {
    return Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Close Shape'));
  });
  if (closeShapeBtn) {
    await closeShapeBtn.asElement()?.click();
    await new Promise(r => setTimeout(r, 500));
    await shot(page, '07-after-close-shape');
    console.log('Clicked Close Shape');
  } else {
    console.log('WARNING: Close Shape button not found');
  }

  await shot(page, '08-3d-preview-with-room');

  console.log('\n=== 4. Story panel ===');
  // Check floor area shown
  const panelText = await page.$eval('body', el => el.innerText);
  console.log('Floor area shown (m²):', panelText.includes('m²'));
  console.log('Redraw button present:', panelText.includes('Redraw'));

  console.log('\n=== 5. Openings panel ===');
  // Expand "Windows & Doors" section
  const openingsHeader = await page.evaluateHandle(() => {
    return Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Windows'));
  });
  if (openingsHeader) {
    await openingsHeader.asElement()?.click();
    await new Promise(r => setTimeout(r, 300));
    await shot(page, '09-openings-panel-expanded');
    console.log('Expanded Windows & Doors panel');
    
    const panelText2 = await page.$eval('body', el => el.innerText);
    console.log('Has wall list:', panelText2.includes('Wall 1') || panelText2.includes('Wall'));
  }

  console.log('\n=== 6. Add a window ===');
  // Click first wall to expand
  const wall1Btn = await page.evaluateHandle(() => {
    return Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Wall 1') || (b.textContent?.includes('Wall') && b.textContent?.includes('m')));
  });
  if (wall1Btn) {
    await wall1Btn.asElement()?.click();
    await new Promise(r => setTimeout(r, 200));
    const addOpeningBtn = await page.evaluateHandle(() => {
      return Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent?.includes('Add opening'));
    });
    if (addOpeningBtn) {
      await addOpeningBtn.asElement()?.click();
      await new Promise(r => setTimeout(r, 400));
      await shot(page, '10-window-added');
      console.log('Added window opening');
    } else {
      console.log('WARNING: Add opening button not found');
    }
  } else {
    console.log('WARNING: Wall 1 button not found');
  }

  console.log('\n=== 7. Takeoff panel ===');
  const takeoffText = await page.$eval('body', el => el.innerText);
  console.log('Has Total Floor Area:', takeoffText.includes('Total Floor Area') || takeoffText.includes('Floor Area'));
  console.log('Has Wall Area:', takeoffText.includes('Wall'));
  console.log('Has Windows area:', takeoffText.includes('Window'));
  console.log('Has Perimeter:', takeoffText.includes('Perim'));

  console.log('\n=== 8. Roof controls ===');
  // Check roof section
  const roofHeader = await page.evaluateHandle(() => {
    return Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent?.includes('Roof'));
  });
  if (roofHeader) {
    await roofHeader.asElement()?.click();
    await new Promise(r => setTimeout(r, 200));
    await shot(page, '11-roof-section');
    console.log('Roof section toggled');
  }

  console.log('\n=== 9. Add second storey ===');
  const addStoryBtn = await page.evaluateHandle(() => {
    return Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent?.trim() === 'Add' || b.textContent?.includes('Add') && !b.textContent?.includes('opening'));
  });
  if (addStoryBtn) {
    await addStoryBtn.asElement()?.click();
    await new Promise(r => setTimeout(r, 300));
    await shot(page, '12-second-storey-added');
    console.log('Added second storey');
    
    const panelText3 = await page.$eval('body', el => el.innerText);
    console.log('Has copy up button:', panelText3.includes('copy up'));
  }

  console.log('\n=== 10. Final state screenshot ===');
  await shot(page, '13-final-state');

  console.log('\n=== Console errors ===');
  console.log('Total errors:', errors.length);
  errors.slice(0, 10).forEach(e => console.log(' -', e.slice(0, 200)));

  await browser.close();
  console.log('\nDone. Screenshots in', OUT);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
