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

for(const [width,height] of [[320,640],[375,667],[360,740],[390,844],[412,915]] as const) {
  test(`Hard Eva Black backpack portrait ${width}×${height}: direct detail, exact data, real photo, modal and swipes`,async ({page,isMobile},testInfo) => {
    test.skip(!isMobile,'Portrait phones only');
    const errors:string[]=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.setViewportSize({width,height}); await page.goto('/');
    await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);
    await goTo(page,27);
    const engine=page.getByTestId('page-flip-engine'), original=await engine.elementHandle();
    const frame=await engine.boundingBox();
    const index=page.locator('.catalog-leaf[data-book-index="27"]').first().locator('.mobile-accessory-index');
    await index.getByRole('region',{name:'Mochilas',exact:true}).getByRole('button',{name:'Mochila Hard Eva Black: ver en página 34',exact:true}).tap(); await settled(page);
    await expect(page.getByTestId('page-indicator')).toHaveText('34 / 39');
    const leaf=page.locator('.catalog-leaf[data-book-index="36"]').first().getByRole('article',{name:'Página 34, HARD EVA BLACK'});
    await expect(leaf.getByRole('heading',{name:'HARD EVA BLACK',exact:true})).toBeVisible();
    const photo=leaf.getByRole('img',{name:'HARD EVA BLACK',exact:true});
    await expect(photo).toHaveAttribute('src',/mobile\/hard-eva-black-backpack-front\.webp$/);
    await photo.evaluate(async node=>{ await (node as HTMLImageElement).decode(); });
    expect(await photo.evaluate(node=>[(node as HTMLImageElement).naturalWidth,(node as HTMLImageElement).naturalHeight])).toEqual([872,1400]);
    await expect(photo).toHaveCSS('object-fit','contain');
    await expect(leaf.locator('.mobile-court-scene')).toBeVisible();
    await expect(leaf.locator('dd')).toHaveText(['32X50X22 CM','HARD EVA Y POLYESTER']);
    await expect(leaf.getByRole('listitem')).toHaveText([
      '01MATERIAL DURO EVA EN EL BOLSILLO DELANTERO',
      '02GRAN CAPACIDAD DE ALMACENAMIENTO',
      '03COMPARTIMENTO PARA PORTÁTIL',
      '04COMPARTIMENTO INDIVIDUAL PARA GUARDAR EL CALZADO',
    ]);
    await expect(leaf.locator('footer')).toContainText('REF: MSTHEB51000');
    await expect(leaf.locator('footer')).toContainText('EAN: 8436612942186');
    const hero=(await leaf.locator('.mobile-accessory-product__hero').boundingBox())!;
    const bag=leaf.getByRole('button',{name:'Ver ficha y opciones de pedido de Mochila Hard Eva Black',exact:true});
    const bounds=(await bag.boundingBox())!;
    expect(bounds.width).toBe(44); expect(bounds.height).toBe(44);
    expect(bounds.x+bounds.width).toBeCloseTo(hero.x+hero.width-8,1);
    expect(bounds.y).toBeCloseTo(hero.y+8,1);
    expect(await bag.evaluate(node=>node.parentElement?.className)).toBe('mobile-accessory-product__hero');
    const specs=(await leaf.locator('.mobile-accessory-product__specs').boundingBox())!;
    const cta=(await leaf.getByRole('button',{name:'Explorar Mochila Hard Eva Black',exact:true}).boundingBox())!;
    expect(specs.y+specs.height).toBeLessThan(cta.y);
    const features=(await leaf.locator('.mobile-accessory-product__features').boundingBox())!;
    expect(features.y+features.height).toBeLessThan(specs.y);
    // Check the actual contained photograph, not the full-width img element:
    // its handle/base must clear the title/cards and the upper-right bag button.
    const imageBounds=await photo.evaluate(node=>{
      const image=node as HTMLImageElement, box=image.getBoundingClientRect();
      const scale=Math.min(box.width/image.naturalWidth,box.height/image.naturalHeight);
      const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
      const [x,y]=getComputedStyle(image).objectPosition.split(' ').map(parseFloat);
      return {x:box.x+(box.width-width)*x/100,y:box.y+(box.height-height)*y/100,width,height};
    });
    const titleBottom=await leaf.locator('h1').evaluate(node=>node.getBoundingClientRect().bottom-parseFloat(getComputedStyle(node).paddingBottom));
    expect(imageBounds.y-titleBottom).toBeGreaterThan(2);
    expect(features.y-imageBounds.y-imageBounds.height).toBeGreaterThan(2);
    expect(bounds.x-imageBounds.x-imageBounds.width).toBeGreaterThan(8);
    const pageBounds=(await leaf.boundingBox())!;
    expect(imageBounds.height/pageBounds.height).toBeGreaterThan(height<=720 ? .35 : .40);
    expect(imageBounds.width/pageBounds.width).toBeGreaterThan(height<=720 ? .30 : .40);
    for(const item of await leaf.locator('h1, .mobile-accessory-product__features li, .mobile-accessory-product__specs, footer, .mobile-accessory-product__explore').all()) {
      const overflow=await item.evaluate(node=>({text:node.textContent,w:node.clientWidth,sw:node.scrollWidth,h:node.clientHeight,sh:node.scrollHeight}));
      expect(overflow.sw,JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.w+1);
      expect(overflow.sh,JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.h+1);
    }
    await page.screenshot({path:testInfo.outputPath(`hard-eva-black-backpack-${width}.png`)});
    for(const name of ['Abrir ficha de Mochila Hard Eva Black','Ver ficha y opciones de pedido de Mochila Hard Eva Black','Explorar Mochila Hard Eva Black']) {
      await leaf.getByRole('button',{name,exact:true}).tap();
      const modal=page.getByRole('dialog',{name:'Mochila Hard Eva Black',exact:true});
      await expect(modal).toBeVisible();
      await expect(modal.getByRole('button',{name:/Ver imagen/})).toHaveCount(4);
      await expect(modal.locator('img[src*="/mobile/"]')).toHaveCount(0);
      await modal.getByRole('button',{name:'Cerrar ficha',exact:true}).tap();
      // Clear Playwright's compatibility mouse hover at the close button,
      // just as the existing Hard Eva touch test does before native gestures.
      await page.mouse.move(0,0);
      await expect(modal).toHaveCount(0); await settled(page);
      await expect(page.getByTestId('page-indicator')).toHaveText('34 / 39');
      expect(await engine.boundingBox()).toEqual(frame);
    }
    await swipe(page,leaf,false);
    await expect(page.getByTestId('page-indicator')).toHaveText('35 / 39');
    await swipe(page,engine,true);
    await expect(page.getByTestId('page-indicator')).toHaveText('34 / 39');
    await swipe(page,leaf,true);
    await expect(page.getByTestId('page-indicator')).toHaveText('33 / 39');
    await page.getByRole('button',{name:'Página anterior',exact:true}).tap(); await settled(page);
    await expect(page.getByTestId('page-indicator')).toHaveText('32 / 39');
    await page.getByRole('button',{name:'Página anterior',exact:true}).tap(); await settled(page);
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

test('Hard Eva Black backpack desktop/landscape retain original P33–P34 and native product hotspots',async ({page,isMobile})=>{
  if(isMobile) await page.setViewportSize({width:915,height:412});
  await page.goto('/'); await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);
  await goTo(page,34);
  await expect(page.getByTestId('page-indicator')).toHaveText('33–34 / 39');
  await expect(page.locator('img[data-catalog-page="34"]')).toBeVisible();
  await expect(page.locator('.mobile-accessory-page, .mobile-accessory-editorial')).toHaveCount(0);
  const hotspot=page.locator('.catalog-leaf[data-book-index="36"]').first().locator('button[data-product-id="m hard eva black"]').first();
  await hotspot.click();
  await expect(page.getByRole('dialog',{name:'Mochila Hard Eva Black',exact:true})).toBeVisible();
});
