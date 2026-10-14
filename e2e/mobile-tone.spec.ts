import {expect,test,type Page,type Locator} from '@playwright/test';

test.beforeEach(async ({page}) => { await page.route('**/api/orders**', route => route.abort()); });
async function settled(page:Page) {
  await expect(page.locator('.catalog-app')).toHaveAttribute('data-book-transition','idle');
  await expect(page.getByTestId('page-flip-engine')).toHaveAttribute('data-flip-state','read');
}
async function goTo(page:Page, number:number) {
  await page.getByTestId('page-indicator').click();
  await page.locator('#page-number').fill(String(number));
  await page.locator('.page-picker button').click(); await settled(page);
}
async function swipe(page:Page, target:Locator, previous:boolean) {
  const box = (await target.boundingBox())!;
  const x = box.x + box.width * (previous ? .1 : .9), y = box.y + box.height * .55;
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{id:1,x,y}]});
    for (const fraction of [.2,.5,1]) {
      await page.waitForTimeout(50);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:x+(previous?1:-1)*box.width*.6*fraction,y}]});
    }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  } finally { await cdp.detach(); }
  await settled(page);
}

for (const [width,height] of [[320,640],[390,844],[412,915]] as const) {
  test(`T-One portrait ${width}×${height}: real editorial, exact shared detail, swipes and original modal`, async ({page,isMobile},testInfo) => {
    test.skip(!isMobile,'Portrait only');
    const errors:string[] = []; page.on('pageerror',error => errors.push(error.message));
    await page.setViewportSize({width,height}); await page.goto('/');
    await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);
    await goTo(page,27);
    await page.getByRole('button',{name:'Paletero T-One Pro: ver en página 30',exact:true}).tap(); await settled(page);
    await expect(page.getByTestId('page-indicator')).toHaveText('TAMARA / 39');
    const engine = page.getByTestId('page-flip-engine'), originalEngine = await engine.elementHandle();
    const frame = (await engine.boundingBox())!;
    const intro = page.locator('.catalog-leaf[data-book-index="31"]').first().locator('.mobile-accessory-editorial--tamara');
    await expect(intro.getByRole('heading',{name:'PRO',exact:true})).toBeVisible();
    await expect(intro.getByText('T-ONE',{exact:true})).toBeVisible();
    await expect(intro.getByText('by Tamara Icardo')).toBeVisible();
    await expect(intro.locator('button, [data-product-id], dl')).toHaveCount(0);
    await expect(intro).not.toContainText(/REF:|EAN:|DIMENSIONES|MATERIALES|EXPLORAR/);
    const heading = (await intro.locator('header').boundingBox())!;
    const signature = (await intro.getByRole('img',{name:'Firma de Tamara Icardo'}).boundingBox())!;
    const portrait = (await intro.getByRole('img',{name:'Tamara Icardo con el paletero T-One Pro'}).boundingBox())!;
    expect(heading.y+heading.height).toBeLessThan(signature.y);
    expect(signature.y+signature.height).toBeLessThan(portrait.y);
    for (const image of await intro.locator('img').all()) {
      await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await expect(image).toHaveCSS('object-fit','contain');
    }
    await page.screenshot({path:testInfo.outputPath(`tone-editorial-${width}.png`)});
    await swipe(page,intro,false);
    await expect(page.getByTestId('page-indicator')).toHaveText('30 / 39');
    const leaf = page.locator('.catalog-leaf[data-book-index="32"]').first().getByRole('article',{name:'Página 30, T-ONE PRO'});
    await expect(leaf.getByRole('heading',{name:'T-ONE PRO',exact:true})).toBeVisible();
    const image = leaf.getByRole('img',{name:'T-ONE PRO',exact:true});
    await expect(image).toHaveAttribute('src',/mobile\/t-one-pro\.webp$/);
    await expect.poll(() => image.evaluate(node => [(node as HTMLImageElement).naturalWidth,(node as HTMLImageElement).naturalHeight])).toEqual([1400,893]);
    await expect(leaf.locator('dd')).toHaveText(['60X34X33 CM','POLYESTER']);
    await expect(leaf.getByRole('listitem')).toHaveText([
      '01DOS COMPARTIMENTOS TERMOTECHPARA PALAS DE PÁDEL',
      '02COMPARTIMENTO INDIVIDUALPARA GUARDAR CALZADO',
      '03BOLSILLO INDIVIDUALPARA BOTE DE PELOTAS',
      '04DOBLE SISTEMA DE TRANSPORTE',
    ]);
    await expect(leaf.locator('footer')).toContainText('REF: BSTONE51000');
    await expect(leaf.locator('footer')).toContainText('EAN: 8436612942148');
    await expect(leaf.locator('.mobile-court-scene')).toBeVisible();
    expect(await engine.boundingBox()).toEqual(frame);
    const hero = (await leaf.locator('.mobile-accessory-product__hero').boundingBox())!;
    const bag = leaf.getByRole('button',{name:'Ver ficha y opciones de pedido de Paletero T-One Pro',exact:true});
    const bagBounds = (await bag.boundingBox())!;
    expect(bagBounds.width).toBe(44); expect(bagBounds.height).toBe(44);
    expect(bagBounds.x+bagBounds.width).toBeCloseTo(hero.x+hero.width-8,1);
    expect(bagBounds.y).toBeCloseTo(hero.y+8,1);
    const title = (await leaf.locator('h1').boundingBox())!;
    expect(title.y+title.height).toBeLessThan(bagBounds.y);
    for (const item of await leaf.locator('h1, .mobile-accessory-product__features li, .mobile-accessory-product__specs, footer, .mobile-accessory-product__explore').all()) {
      const overflow = await item.evaluate(node => ({text:node.textContent,w:node.clientWidth,sw:node.scrollWidth,h:node.clientHeight,sh:node.scrollHeight}));
      expect(overflow.sw,JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.w+1);
      expect(overflow.sh,JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.h+1);
    }
    await page.screenshot({path:testInfo.outputPath(`tone-detail-${width}.png`)});
    for (const name of ['Abrir ficha de Paletero T-One Pro','Ver ficha y opciones de pedido de Paletero T-One Pro','Explorar Paletero T-One Pro']) {
      await leaf.getByRole('button',{name,exact:true}).tap();
      const modal = page.getByRole('dialog',{name:'Paletero T-One Pro',exact:true});
      await expect(modal).toBeVisible();
      await expect(modal.getByRole('button',{name:/Ver imagen/})).toHaveCount(5);
      await expect(modal.locator('img[src*="/mobile/"]')).toHaveCount(0);
      await modal.getByRole('button',{name:'Cerrar ficha',exact:true}).tap();
      await expect(modal).toHaveCount(0);
      await expect(page.getByTestId('page-indicator')).toHaveText('30 / 39');
    }
    await swipe(page,leaf,true);
    await expect(page.getByTestId('page-indicator')).toHaveText('TAMARA / 39');
    await swipe(page,intro,true);
    await expect(page.getByTestId('page-indicator')).toHaveText('27 / 39');
    await page.getByRole('button',{name:'Paletero T-One Pro: ver en página 30',exact:true}).tap(); await settled(page);
    await page.getByRole('button',{name:'Página siguiente',exact:true}).tap(); await settled(page);
    await expect(page.getByTestId('page-indicator')).toHaveText('30 / 39');
    await page.getByRole('button',{name:'Página siguiente',exact:true}).tap(); await settled(page);
    await expect(page.getByTestId('page-indicator')).toHaveText('31 / 39');
    await page.getByRole('button',{name:'Página anterior',exact:true}).tap(); await settled(page);
    await expect(page.getByTestId('page-indicator')).toHaveText('30 / 39');
    expect(await originalEngine!.evaluate(node => node.isConnected)).toBe(true);
    await page.getByRole('button',{name:'Abrir pedido',exact:true}).tap();
    await expect(page.getByRole('dialog',{name:'Pedido',exact:true})).toContainText('Todavía no agregaste productos');
    expect(errors).toEqual([]);
  });
}

test('T-One retains the native P30–TAMARA spread in desktop and landscape',async ({page,isMobile}) => {
  if(isMobile) await page.setViewportSize({width:915,height:412});
  await page.goto('/'); await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);
  await goTo(page,30);
  await expect(page.getByTestId('page-indicator')).toHaveText('30–TAMARA / 39');
  await expect(page.locator('img[data-catalog-page="30"]')).toBeVisible();
  await expect(page.locator('.tamara-editorial__photo')).toHaveAttribute('src','/banners/tamara-editorial-1672.webp');
  await expect(page.locator('.mobile-accessory-page, .mobile-accessory-editorial')).toHaveCount(0);
});

test('T-One rotation keeps the logical detail and restores native Tamara, then portrait again',async ({page,isMobile}) => {
  test.skip(!isMobile,'Phone rotation');
  await page.goto('/'); await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);
  await goTo(page,30); await expect(page.getByTestId('page-indicator')).toHaveText('30 / 39');
  await page.setViewportSize({width:915,height:412}); await settled(page);
  await expect(page.getByTestId('page-indicator')).toHaveText('30–TAMARA / 39');
  await expect(page.locator('.tamara-editorial__photo')).toHaveAttribute('src','/banners/tamara-editorial-1672.webp');
  await page.setViewportSize({width:412,height:915}); await settled(page);
  await expect(page.getByTestId('page-indicator')).toHaveText('30 / 39');
  await expect(page.getByRole('heading',{name:'T-ONE PRO',exact:true})).toBeVisible();
});
