import {expect,test,type Page,type Locator} from '@playwright/test';

test.beforeEach(async ({page}) => { await page.route('**/api/orders**',route => route.abort()); });
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
  const x = box.x+box.width*(previous ? .1 : .9), y = box.y+box.height*.55;
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y}]});
    for(const fraction of [.2,.5,1]) {
      await page.waitForTimeout(50);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:x+(previous?1:-1)*box.width*.6*fraction,y}]});
    }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  } finally { await cdp.detach(); }
  await settled(page);
}

for(const [width,height] of [[320,640],[390,844],[412,915]] as const) {
  test(`Star portrait ${width}×${height}: direct detail, exact data, real photo, modal and swipes`,async ({page,isMobile},testInfo) => {
    test.skip(!isMobile,'Portrait phones only');
    const errors:string[]=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.setViewportSize({width,height}); await page.goto('/');
    await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);
    await goTo(page,27);
    const engine=page.getByTestId('page-flip-engine'), original=await engine.elementHandle();
    const frame=await engine.boundingBox();
    await page.getByRole('button',{name:'Paletero Star: ver en página 32',exact:true}).tap(); await settled(page);
    await expect(page.getByTestId('page-indicator')).toHaveText('32 / 39');
    const leaf=page.locator('.catalog-leaf[data-book-index="34"]').first().getByRole('article',{name:'Página 32, STAR'});
    await expect(leaf.getByRole('heading',{name:'STAR',exact:true})).toBeVisible();
    const photo=leaf.getByRole('img',{name:'STAR',exact:true});
    await expect(photo).toHaveAttribute('src',/mobile\/star-bag\.webp$/);
    await photo.evaluate(async node=>{ await (node as HTMLImageElement).decode(); });
    expect(await photo.evaluate(node=>[(node as HTMLImageElement).naturalWidth,(node as HTMLImageElement).naturalHeight])).toEqual([1400,764]);
    await expect(photo).toHaveCSS('object-fit','contain');
    await expect(leaf.locator('.mobile-court-scene')).toBeVisible();
    await expect(leaf.locator('dd')).toHaveText(['56X29X28 CM','POLYESTER']);
    await expect(leaf.getByRole('listitem')).toHaveText([
      '01GRAN CAPACIDAD DE ALMACENAMIENTO',
      '02COMPARTIMENTO INDIVIDUALPARA GUARDAR EL CALZADO',
      '03REFUERZO EXTRA EN SUS ASAS',
      '04BOLSILLO LATERALPARA PEQUEÑOS ACCESORIOS',
    ]);
    await expect(leaf.locator('footer')).toContainText('REF: BSTSTAR51000');
    await expect(leaf.locator('footer')).toContainText('EAN: 8436612942162');
    const hero=(await leaf.locator('.mobile-accessory-product__hero').boundingBox())!;
    const bag=leaf.getByRole('button',{name:'Ver ficha y opciones de pedido de Paletero Star',exact:true});
    const bounds=(await bag.boundingBox())!;
    expect(bounds.width).toBe(44); expect(bounds.height).toBe(44);
    expect(bounds.x+bounds.width).toBeCloseTo(hero.x+hero.width-8,1);
    expect(bounds.y).toBeCloseTo(hero.y+8,1);
    expect(await bag.evaluate(node=>node.parentElement?.className)).toBe('mobile-accessory-product__hero');
    const specs=(await leaf.locator('.mobile-accessory-product__specs').boundingBox())!;
    const cta=(await leaf.getByRole('button',{name:'Explorar Paletero Star',exact:true}).boundingBox())!;
    expect(specs.y+specs.height).toBeLessThan(cta.y);
    const features=(await leaf.locator('.mobile-accessory-product__features').boundingBox())!;
    expect(features.y+features.height).toBeLessThan(specs.y);
    for(const item of await leaf.locator('h1, .mobile-accessory-product__features li, .mobile-accessory-product__specs, footer, .mobile-accessory-product__explore').all()) {
      const overflow=await item.evaluate(node=>({text:node.textContent,w:node.clientWidth,sw:node.scrollWidth,h:node.clientHeight,sh:node.scrollHeight}));
      expect(overflow.sw,JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.w+1);
      expect(overflow.sh,JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.h+1);
    }
    await page.screenshot({path:testInfo.outputPath(`star-bag-${width}.png`)});
    for(const name of ['Abrir ficha de Paletero Star','Ver ficha y opciones de pedido de Paletero Star','Explorar Paletero Star']) {
      await leaf.getByRole('button',{name,exact:true}).tap();
      const modal=page.getByRole('dialog',{name:'Paletero Star',exact:true});
      await expect(modal).toBeVisible();
      await expect(modal.getByRole('button',{name:/Ver imagen/})).toHaveCount(5);
      await expect(modal.locator('img[src*="/mobile/"]')).toHaveCount(0);
      await modal.getByRole('button',{name:'Cerrar ficha',exact:true}).tap();
      // Clear Playwright's compatibility mouse hover at the close button,
      // just as the existing Hard Eva touch test does before native gestures.
      await page.mouse.move(0,0);
      await expect(modal).toHaveCount(0); await settled(page);
      await expect(page.getByTestId('page-indicator')).toHaveText('32 / 39');
      expect(await engine.boundingBox()).toEqual(frame);
    }
    await swipe(page,leaf,false);
    await expect(page.getByTestId('page-indicator')).toHaveText('33 / 39');
    await swipe(page,engine,true);
    await expect(page.getByTestId('page-indicator')).toHaveText('32 / 39');
    await swipe(page,leaf,true);
    await expect(page.getByTestId('page-indicator')).toHaveText('31 / 39');
    await page.getByRole('button',{name:'Página anterior',exact:true}).tap(); await settled(page);
    await expect(page.getByTestId('page-indicator')).toHaveText('30 / 39');
    await page.getByRole('button',{name:'Página anterior',exact:true}).tap(); await settled(page);
    await expect(page.getByTestId('page-indicator')).toHaveText('TAMARA / 39');
    await page.getByRole('button',{name:'Página anterior',exact:true}).tap(); await settled(page);
    await expect(page.getByTestId('page-indicator')).toHaveText('27 / 39');
    expect(await original!.evaluate(node=>node.isConnected)).toBe(true);
    await page.getByRole('button',{name:'Abrir pedido',exact:true}).tap();
    await expect(page.getByRole('dialog',{name:'Pedido',exact:true})).toContainText('Todavía no agregaste productos');
    expect(errors).toEqual([]);
  });
}

test('Star desktop/landscape retain original P31–P32 and native product hotspots',async ({page,isMobile})=>{
  if(isMobile) await page.setViewportSize({width:915,height:412});
  await page.goto('/'); await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);
  await goTo(page,32);
  await expect(page.getByTestId('page-indicator')).toHaveText('31–32 / 39');
  await expect(page.locator('img[data-catalog-page="32"]')).toBeVisible();
  await expect(page.locator('.mobile-accessory-page, .mobile-accessory-editorial')).toHaveCount(0);
  const hotspot=page.locator('.catalog-leaf[data-book-index="34"]').first().locator('button[data-product-id="star"]').first();
  await hotspot.click();
  await expect(page.getByRole('dialog',{name:'Paletero Star',exact:true})).toBeVisible();
});
