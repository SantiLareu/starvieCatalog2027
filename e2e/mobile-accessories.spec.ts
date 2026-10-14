import { expect, test, type Locator, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.route('**/api/orders**', route => route.abort()); });
async function goTo(page: Page, number: number) {
  await page.getByTestId('page-indicator').click();
  await page.locator('#page-number').fill(String(number));
  await page.locator('.page-picker button').click();
  const landscape = await page.getByTestId('page-flip-engine').getAttribute('data-orientation') === 'landscape';
  const spreadStart = number % 2 ? number : number-1;
  await expect(page.getByTestId('page-indicator')).toHaveText(landscape
    ? number === 29 ? '29–SANYO / 39' : `${spreadStart}–${spreadStart+1} / 39`
    : `${number} / 39`);
  await expect(page.locator('.catalog-app')).toHaveAttribute('data-book-transition', 'idle');
  await expect(page.getByTestId('page-flip-engine')).toHaveAttribute('data-flip-state', 'read');
}
async function swipe(page: Page, target: Locator, right: boolean) {
  const box = (await target.boundingBox())!;
  const x = box.x + box.width * (right ? .1 : .9), y = box.y + box.height * .55;
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x, y }] });
    for (const fraction of [.2,.5,1]) {
      await page.waitForTimeout(50);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: x + (right ? 1 : -1) * box.width * .6 * fraction, y }] });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally { await cdp.detach(); }
}

test('portrait: all eleven index entries retain their real detail destinations', async ({ page, isMobile }, testInfo) => {
  test.skip(!isMobile, 'Mobile portrait only'); test.setTimeout(90_000);
  await page.goto('/'); await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);
  await goTo(page, 27);
  const engine = page.getByTestId('page-flip-engine');
  const originalEngine = await engine.elementHandle();
  const index = page.locator('.catalog-leaf[data-book-index="27"]').first().getByRole('article', { name: 'Página 27, índice de accesorios StarVie' });
  await expect(index.getByRole('heading', { level: 1 })).toHaveText('Seleccioná un producto para verlo');
  await expect(index.locator('.mobile-court-scene')).toBeVisible();
  expect(await index.locator('.mobile-court-scene').evaluate(node => getComputedStyle(node,'::before').backgroundImage)).toContain('padel-court-clean');
  expect(await index.locator('.mobile-court-scene').evaluate(node => getComputedStyle(node).opacity)).toBe('1');
  await expect(index.getByRole('heading', { level: 2 })).toHaveText(['Paleteros', 'Mochilas', 'Accesorios']);
  const cards = index.locator('.mobile-accessory-index__card');
  await expect(cards).toHaveCount(11);
  for (const image of await cards.locator('img').all()) {
    await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  await page.screenshot({ path: testInfo.outputPath('accessory-index-portrait.png') });
  const frame = await engine.boundingBox();
  for (const [name, number] of [
    ['Paletero Hard Eva Eternal',29], ['Paletero T-One Pro',30], ['Paletero Hard Eva Black',28],
    ['Paletero Pro Master',31], ['Paletero Star',32], ['Paletero Neon Strike',33],
    ['Mochila Hard Eva Black',34], ['Mochila Black Voltage',36], ['Mochila Artic Sport',35],
    ['Neceser Navy',37], ['Neceser Moss',37],
  ] as const) {
    await index.getByRole('button', { name: `${name}: ver en página ${number}`, exact: true }).tap();
    await expect(page.getByTestId('page-indicator')).toHaveText(number === 29 ? 'SANYO / 39' : number === 30 ? 'TAMARA / 39' : `${number} / 39`);
    await expect(page.locator('.catalog-app')).toHaveAttribute('data-book-transition', 'idle');
    await expect(engine).toHaveAttribute('data-flip-state', 'read');
    await expect(page.locator('.product-modal')).toHaveCount(0);
    if (number === 28) await page.getByRole('button', { name: 'Página anterior', exact: true }).tap();
    else await goTo(page,27);
    await expect(page.getByTestId('page-indicator')).toHaveText('27 / 39');
    await expect(page.locator('.catalog-app')).toHaveAttribute('data-book-transition','idle');
    await expect(engine).toHaveAttribute('data-flip-state','read');
    expect(await engine.boundingBox()).toEqual(frame);
  }
  expect(await originalEngine!.evaluate(node => node.isConnected)).toBe(true);
});

test('portrait: real Hard Eva photo, features, modal, pinch and native swipes', async ({ page, isMobile }, testInfo) => {
  test.skip(!isMobile, 'Mobile portrait only');
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);
  await goTo(page,27);
  const engine = page.getByTestId('page-flip-engine');
  const index = page.locator('.catalog-leaf[data-book-index="27"]').first().locator('.mobile-accessory-index');
  await swipe(page,index,false);
  await expect(page.getByTestId('page-indicator')).toHaveText('28 / 39');
  await expect(engine).toHaveAttribute('data-flip-state','read');
  const source = page.locator('.catalog-leaf[data-book-index="28"]').first();
  const leaf = source.getByRole('article', { name: 'Página 28, HARD EVA BLACK' });
  await expect(leaf.getByRole('heading', { level: 1 })).toHaveText('HARD EVA BLACK');
  await expect(leaf.getByRole('img', { name: 'HARD EVA BLACK' })).toHaveAttribute('src', /mobile\/hard-eva-black\.webp$/);
  await expect.poll(() => leaf.getByRole('img', { name: 'HARD EVA BLACK' }).evaluate(node => (node as HTMLImageElement).naturalWidth)).toBe(1400);
  await expect(leaf.locator('dd')).toHaveText(['62x35x35 cm','Hard Eva y PVC']);
  await expect(leaf.locator('footer')).toContainText('REF: BSTHEB51000');
  await expect(leaf.locator('footer')).toContainText('EAN: 8436612942124');
  await expect(leaf.getByRole('listitem')).toHaveText([
    '01Hard Eva materialMaterial duro EVA en bolsillo lateral',
    '02Compartimento individualPara guardar calzado',
    '03Bolsillo individualPara bote de pelotas', '04Doble sistema de transporte',
    '05Compartimento ThermotechPara palas de pádel',
  ]);
  await page.screenshot({ path: testInfo.outputPath('hard-eva-portrait.png') });
  const frame = await engine.boundingBox();
  for (const name of ['Abrir ficha de Paletero Hard Eva Black', 'Explorar Paletero Hard Eva Black', 'Ver ficha y opciones de pedido de Paletero Hard Eva Black']) {
    await leaf.getByRole('button', { name, exact: true }).tap();
    const modal = page.getByRole('dialog', { name: 'Paletero Hard Eva Black', exact: true });
    await expect(modal).toHaveClass(/product-modal/);
    await expect(modal.getByRole('button', { name: /Ver imagen/ })).toHaveCount(4);
    await expect(modal.locator('img[src*="/mobile/"]')).toHaveCount(0);
    await modal.getByRole('button', { name: 'Cerrar ficha', exact: true }).tap();
    await expect(modal).toHaveCount(0); expect(await engine.boundingBox()).toEqual(frame);
  }
  const viewport = source.getByTestId('mobile-accessory-viewport');
  // Page-picker clicks leave an emulated mouse at the top corner. Retract
  // that hover before switching to the real touch sequence below.
  await page.mouse.move(0,0);
  await expect(engine).toHaveAttribute('data-flip-state','read');
  const box = (await viewport.boundingBox())!, x = box.x + box.width / 2, y = box.y + box.height * .3;
  const touch = await page.context().newCDPSession(page);
  try {
    await touch.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{id:1,x:x-box.width*.12,y},{id:2,x:x+box.width*.12,y}] });
    for (const separation of [.16,.2,.24]) {
      await touch.send('Input.dispatchTouchEvent', { type:'touchMove', touchPoints:[{id:1,x:x-box.width*separation,y},{id:2,x:x+box.width*separation,y}] });
      await page.waitForTimeout(35);
    }
    await touch.send('Input.dispatchTouchEvent', { type:'touchEnd', touchPoints:[] });
  } finally { await touch.detach(); }
  await expect(viewport).toHaveAttribute('data-zoom','2.00');
  await expect(page.locator('.product-modal')).toHaveCount(0);
  await expect(engine).toHaveAttribute('data-flip-state','read');
  await page.getByRole('button', { name:'Página anterior',exact:true }).tap();
  await expect(page.getByTestId('page-indicator')).toHaveText('27 / 39');
  await expect(engine).toHaveAttribute('data-flip-state','read');
  await page.getByRole('button', { name:'Página siguiente',exact:true }).tap();
  await expect(page.getByTestId('page-indicator')).toHaveText('28 / 39');
  await expect(engine).toHaveAttribute('data-flip-state','read');
  await expect(viewport).toHaveAttribute('data-zoom','1.00');
  await swipe(page,leaf,true);
  await expect(page.getByTestId('page-indicator')).toHaveText('27 / 39');
  await expect(engine).toHaveAttribute('data-flip-state','read');
  await page.getByRole('button', { name:'Página anterior',exact:true }).tap();
  await expect(page.getByTestId('page-indicator')).toHaveText('26 / 39');
  await expect(engine).toHaveAttribute('data-flip-state','read');
  await expect(page.getByRole('heading', {name:'KYRA',exact:true})).toBeVisible();
  await page.getByRole('button', { name:'Abrir pedido' }).tap();
  await expect(page.getByRole('dialog', {name:'Pedido',exact:true})).toContainText('Todavía no agregaste productos');
  expect(errors).toEqual([]);
});

for (const [width,height] of [[320,640], [390,844], [412,915]] as const) {
test(`portrait ${width}×${height}: cards and bag content stay within the reading band`, async ({ page, isMobile }, testInfo) => {
  test.skip(!isMobile, 'Mobile portrait only');
  await page.setViewportSize({ width,height }); await page.goto('/');
  await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);
  for (const number of [27,28,29]) {
    await goTo(page,number);
    const leaf = page.locator(`.catalog-leaf[data-book-index="${number === 29 ? 30 : number}"]`).first().locator('.mobile-accessory-page');
    const bounds = (await leaf.boundingBox())!;
    for (const item of await leaf.locator('h1, h2, .mobile-accessory-index__card, .mobile-accessory-product__features li, .mobile-accessory-product__specs, footer, .mobile-accessory-product__explore').all()) {
      const box = (await item.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(bounds.x); expect(box.x+box.width).toBeLessThanOrEqual(bounds.x+bounds.width+1);
      expect(box.y+box.height).toBeLessThanOrEqual(bounds.y+bounds.height+1);
      const overflow = await item.evaluate(node => ({ text:node.textContent, className:node.className, width:node.clientWidth, scrollWidth:node.scrollWidth, height:node.clientHeight, scrollHeight:node.scrollHeight }));
      expect(overflow.scrollWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.width+1);
      expect(overflow.scrollHeight, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.height+1);
    }
    const guide = (await page.locator('.mobile-gesture-hint').boundingBox())!;
    expect(bounds.y+bounds.height).toBeLessThanOrEqual(guide.y+1);
    if (number === 28 || number === 29) {
      const specs = (await leaf.locator('.mobile-accessory-product__specs').boundingBox())!;
      const hero = (await leaf.locator('.mobile-accessory-product__hero').boundingBox())!;
      const title = (await leaf.locator('h1').boundingBox())!;
      const features = (await leaf.locator('.mobile-accessory-product__features').boundingBox())!;
      const action = (await leaf.locator('.mobile-accessory-product__explore').boundingBox())!;
      const bag = leaf.getByRole('button', {name:`Ver ficha y opciones de pedido de Paletero Hard Eva ${number === 28 ? 'Black' : 'Eternal'}`,exact:true});
      const bagBounds = (await bag.boundingBox())!;
      expect(bagBounds.width).toBe(44);
      expect(bagBounds.height).toBe(44);
      expect(bagBounds.x).toBeGreaterThan(hero.x+hero.width/2);
      expect(bagBounds.x+bagBounds.width).toBeCloseTo(hero.x+hero.width-8,1);
      expect(bagBounds.y).toBeCloseTo(hero.y+8,1);
      expect(bagBounds.y+bagBounds.height).toBeLessThan(hero.y+hero.height);
      expect(bagBounds.y).toBeGreaterThan(title.y+title.height);
      expect(await bag.evaluate(node => node.parentElement?.className)).toBe('mobile-accessory-product__hero');
      await expect(bag).toHaveCSS('border-radius','50%');
      await expect(bag).toHaveCSS('--mobile-premium-accent','#e84b3e');
      expect(title.y+title.height).toBeLessThan(hero.y);
      expect(hero.y+hero.height).toBeLessThan(features.y);
      expect(specs.y+specs.height).toBeLessThan(action.y);
      let previousBottom = 0;
      for (const item of await leaf.getByRole('listitem').all()) {
        const box = (await item.boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(previousBottom);
        expect(box.y+box.height).toBeLessThan(specs.y);
        previousBottom = box.y+box.height;
      }
    }
    await page.screenshot({path:testInfo.outputPath(`accessories-${number}-${width}.png`)});
  }
});
}

test('desktop and landscape retain the original accessory PDFs and section index', async ({page,isMobile},testInfo) => {
  if(isMobile) await page.setViewportSize({width:915,height:412});
  await page.goto('/'); await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);
  for(const number of [27,28,29]) {
    await goTo(page,number);
    await expect(page.locator(`img[data-catalog-page="${number}"]`)).toBeVisible();
    await expect(page.locator('.mobile-accessory-page')).toHaveCount(0);
    await expect(page.locator('.mobile-court-experience')).toHaveCount(0);
    await page.screenshot({path:testInfo.outputPath(`accessories-original-${number}.png`)});
  }
});

test('portrait P29: Eternal uses the shared bag template and original product modal', async ({page,isMobile},testInfo) => {
  test.skip(!isMobile, 'Mobile portrait only');
  await page.goto('/'); await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);
  await goTo(page,27);
  const index = page.locator('.catalog-leaf[data-book-index="27"]').first().locator('.mobile-accessory-index');
  await index.getByRole('button', {name:'Paletero Hard Eva Eternal: ver en página 29',exact:true}).tap();
  const engine = page.getByTestId('page-flip-engine');
  await expect(page.getByTestId('page-indicator')).toHaveText('SANYO / 39');
  await expect(page.locator('.catalog-app')).toHaveAttribute('data-book-transition','idle');
  await expect(engine).toHaveAttribute('data-flip-state','read');
  const intro = page.locator('.catalog-leaf[data-book-index="29"]').first().locator('.mobile-eternal-editorial');
  await expect(intro.getByRole('heading',{name:'ETERNAL'})).toBeVisible();
  await expect(intro.getByText('by Sanyo Gutiérrez')).toBeVisible();
  await expect(intro.locator('button, [data-product-id], dl')).toHaveCount(0);
  await swipe(page,intro,false);
  await expect(page.getByTestId('page-indicator')).toHaveText('29 / 39');
  await expect(page.locator('.catalog-app')).toHaveAttribute('data-book-transition','idle');
  await expect(engine).toHaveAttribute('data-flip-state','read');
  const leaf = page.locator('.catalog-leaf[data-book-index="30"]').first().getByRole('article',{name:'Página 29, HARD EVA ETERNAL'});
  await expect(leaf.getByRole('heading',{name:'HARD EVA ETERNAL'})).toBeVisible();
  const hero = leaf.getByRole('img',{name:'HARD EVA ETERNAL'});
  await expect(hero).toHaveAttribute('src',/mobile\/hard-eva-eternal\.webp$/);
  await expect.poll(() => hero.evaluate(node => [(node as HTMLImageElement).naturalWidth,(node as HTMLImageElement).naturalHeight])).toEqual([1400,778]);
  await expect(leaf.locator('dd')).toHaveText(['62x35x35 cm','Hard Eva y PVC']);
  await expect(leaf.locator('footer')).toContainText('REF: BSTETE51000');
  await expect(leaf.locator('footer')).toContainText('EAN: 8436612942131');
  await expect(leaf.getByRole('listitem')).toHaveText([
    '01Hard Eva materialMaterial duro EVA en bolsillo lateral', '02Compartimento individualPara guardar calzado',
    '03Bolsillo individualPara bote de pelotas', '04Doble sistema de transporte', '05Compartimento ThermotechPara palas de pádel',
  ]);
  await expect(leaf.locator('.mobile-court-scene')).toBeVisible();
  await expect(leaf.getByRole('button',{name:'Explorar Paletero Hard Eva Eternal'})).toBeVisible();
  await page.screenshot({path:testInfo.outputPath('hard-eva-eternal-portrait.png')});
  const frame = await engine.boundingBox();
  for (const name of ['Abrir ficha de Paletero Hard Eva Eternal', 'Explorar Paletero Hard Eva Eternal', 'Ver ficha y opciones de pedido de Paletero Hard Eva Eternal']) {
    await leaf.getByRole('button',{name,exact:true}).tap();
    const modal = page.getByRole('dialog',{name:'Paletero Hard Eva Eternal',exact:true});
    await expect(modal).toHaveClass(/product-modal/);
    await expect(modal.getByRole('button',{name:/Ver imagen/})).toHaveCount(5);
    await expect(modal.locator('img[src*="/mobile/"]')).toHaveCount(0);
    await modal.getByRole('button',{name:'Cerrar ficha',exact:true}).tap();
    await expect(modal).toHaveCount(0);
    await expect(page.getByTestId('page-indicator')).toHaveText('29 / 39');
    expect(await engine.boundingBox()).toEqual(frame);
  }
  await swipe(page,leaf,true);
  await expect(page.getByTestId('page-indicator')).toHaveText('SANYO / 39');
  await expect(engine).toHaveAttribute('data-flip-state','read');
  await swipe(page,intro,true);
  await expect(page.getByTestId('page-indicator')).toHaveText('27 / 39');
  await expect(page.locator('.catalog-app')).toHaveAttribute('data-book-transition','idle');
  await expect(engine).toHaveAttribute('data-flip-state','read');
  await index.getByRole('button',{name:'Paletero Hard Eva Eternal: ver en página 29',exact:true}).tap();
  await expect(page.getByTestId('page-indicator')).toHaveText('SANYO / 39');
  await expect(page.locator('.catalog-app')).toHaveAttribute('data-book-transition','idle');
  await page.getByRole('button',{name:'Página siguiente',exact:true}).tap();
  await expect(page.getByTestId('page-indicator')).toHaveText('29 / 39');
  await expect(engine).toHaveAttribute('data-flip-state','read');
  await page.getByRole('button',{name:'Página siguiente',exact:true}).tap();
  await expect(page.getByTestId('page-indicator')).toHaveText('TAMARA / 39');
  await expect(engine).toHaveAttribute('data-flip-state','read');
  await page.getByRole('button',{name:'Página siguiente',exact:true}).tap();
  await expect(page.getByTestId('page-indicator')).toHaveText('30 / 39');
  await expect(engine).toHaveAttribute('data-flip-state','read');
  await page.getByRole('button',{name:'Página anterior',exact:true}).tap();
  await expect(page.getByTestId('page-indicator')).toHaveText('TAMARA / 39');
  await expect(engine).toHaveAttribute('data-flip-state','read');
  await page.getByRole('button',{name:'Abrir pedido',exact:true}).tap();
  await expect(page.getByRole('dialog',{name:'Pedido',exact:true})).toContainText('Todavía no agregaste productos');
});
