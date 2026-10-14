import {expect,test,type Page,type Locator} from '@playwright/test';

test.beforeEach(async ({page})=>{ await page.route('**/api/orders**',route=>route.abort()); });
async function settled(page:Page) {
  await expect(page.locator('.catalog-app')).toHaveAttribute('data-book-transition','idle');
  await expect(page.getByTestId('page-flip-engine')).toHaveAttribute('data-flip-state','read');
}
async function goTo(page:Page,number:number) {
  await page.getByTestId('page-indicator').click();
  await page.locator('#page-number').fill(String(number));
  await page.locator('.page-picker button').click(); await settled(page);
}
async function swipe(page:Page,target:Locator,previous:boolean) {
  const box=(await target.boundingBox())!;
  const x=box.x+box.width*(previous ? .1 : .9),y=box.y+box.height*.55;
  const cdp=await page.context().newCDPSession(page);
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
async function layout(leaf:Locator) {
  return leaf.evaluate(node=>Object.fromEntries([
    'header','.mobile-accessory-product__hero','.mobile-accessory-product__features',
    '.mobile-accessory-product__specs','footer','.mobile-accessory-product__explore',
    '.mobile-premium-product-page__product-button',
  ].map(selector=>{
    const box=node.querySelector(selector)!.getBoundingClientRect();
    return [selector,{x:box.x,y:box.y,width:box.width}];
  })));
}

for(const [width,height] of [[320,640],[375,667],[360,740],[390,844],[412,915]] as const) {
  test(`Artic Sport portrait ${width}×${height}: approved backpack layout, real photo, modal and swipes`,async ({page,isMobile},testInfo)=>{
    test.skip(!isMobile,'Portrait phones only');
    const errors:string[]=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.setViewportSize({width,height}); await page.goto('/');
    await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);
    await goTo(page,34);
    const approved=await layout(page.locator('.catalog-leaf[data-book-index="36"]').first().locator('.mobile-accessory-product'));
    await goTo(page,27);
    const engine=page.getByTestId('page-flip-engine'),original=await engine.elementHandle(),frame=await engine.boundingBox();
    const index=page.locator('.catalog-leaf[data-book-index="27"]').first().locator('.mobile-accessory-index');
    await index.getByRole('region',{name:'Mochilas',exact:true}).getByRole('button',{name:'Mochila Artic Sport: ver en página 35',exact:true}).tap(); await settled(page);
    await expect(page.getByTestId('page-indicator')).toHaveText('35 / 39');
    const leaf=page.locator('.catalog-leaf[data-book-index="37"]').first().getByRole('article',{name:'Página 35, ARTIC SPORT'});
    await expect(leaf.getByRole('heading',{name:'ARTIC SPORT',exact:true})).toBeVisible();
    expect(await layout(leaf)).toEqual(approved);
    const photo=leaf.getByRole('img',{name:'ARTIC SPORT',exact:true});
    await expect(photo).toHaveAttribute('src',/mobile\/artic-sport-backpack\.webp$/);
    await photo.evaluate(node=>(node as HTMLImageElement).decode());
    expect(await photo.evaluate(node=>[(node as HTMLImageElement).naturalWidth,(node as HTMLImageElement).naturalHeight])).toEqual([842,1400]);
    await expect(photo).toHaveCSS('object-fit','contain');
    await expect(leaf.locator('.mobile-court-scene')).toBeVisible();
    await expect(leaf.locator('dd')).toHaveText(['50X32X18,5 CM','POLYESTER']);
    await expect(leaf.getByRole('listitem')).toHaveText([
      '01GRAN CAPACIDAD DE ALMACENAMIENTO',
      '02COMPARTIMENTO INDIVIDUAL PARA GUARDAR EL CALZADO',
      '03REFUERZO EXTRA EN SUS ASAS',
      '04COMPARTIMENTO PARA PORTÁTIL',
    ]);
    await expect(leaf.locator('footer')).toContainText('REF: MSTAR51000');
    await expect(leaf.locator('footer')).toContainText('EAN: 8436612942209');
    const bag=leaf.getByRole('button',{name:'Ver ficha y opciones de pedido de Mochila Artic Sport',exact:true});
    const bagBox=(await bag.boundingBox())!,hero=(await leaf.locator('.mobile-accessory-product__hero').boundingBox())!;
    expect(bagBox.width).toBe(44); expect(bagBox.height).toBe(44);
    expect(bagBox.x+bagBox.width).toBeCloseTo(hero.x+hero.width-8,1);
    expect(bagBox.y).toBeCloseTo(hero.y+8,1);
    const imageBounds=await photo.evaluate(node=>{
      const image=node as HTMLImageElement,box=image.getBoundingClientRect();
      const scale=Math.min(box.width/image.naturalWidth,box.height/image.naturalHeight);
      const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
      return {x:box.x+(box.width-width)/2,y:box.bottom-height,width,height};
    });
    const titleBottom=await leaf.locator('h1').evaluate(node=>node.getBoundingClientRect().bottom-parseFloat(getComputedStyle(node).paddingBottom));
    const features=(await leaf.locator('.mobile-accessory-product__features').boundingBox())!;
    const specs=(await leaf.locator('.mobile-accessory-product__specs').boundingBox())!;
    const cta=(await leaf.locator('.mobile-accessory-product__explore').boundingBox())!;
    expect(imageBounds.y-titleBottom).toBeGreaterThan(2);
    expect(features.y-imageBounds.y-imageBounds.height).toBeGreaterThan(2);
    expect(bagBox.x-imageBounds.x-imageBounds.width).toBeGreaterThan(8);
    expect(features.y+features.height).toBeLessThan(specs.y);
    expect(specs.y+specs.height).toBeLessThan(cta.y);
    for(const item of await leaf.locator('h1, li, .mobile-accessory-product__specs, footer, .mobile-accessory-product__explore').all()) {
      const overflow=await item.evaluate(node=>({w:node.clientWidth,sw:node.scrollWidth,h:node.clientHeight,sh:node.scrollHeight}));
      expect(overflow.sw).toBeLessThanOrEqual(overflow.w+1); expect(overflow.sh).toBeLessThanOrEqual(overflow.h+1);
    }
    await page.screenshot({path:testInfo.outputPath(`artic-sport-${width}.png`)});
    for(const name of ['Abrir ficha de Mochila Artic Sport','Ver ficha y opciones de pedido de Mochila Artic Sport','Explorar Mochila Artic Sport']) {
      await leaf.getByRole('button',{name,exact:true}).tap();
      const modal=page.getByRole('dialog',{name:'Mochila Artic Sport',exact:true});
      await expect(modal).toBeVisible();
      await expect(modal.getByRole('button',{name:/Ver imagen/})).toHaveCount(4);
      await expect(modal.locator('img[src*="/mobile/"]')).toHaveCount(0);
      await modal.getByRole('button',{name:'Cerrar ficha',exact:true}).tap(); await page.mouse.move(0,0);
      await expect(modal).toHaveCount(0); await settled(page);
      await expect(page.getByTestId('page-indicator')).toHaveText('35 / 39');
      expect(await engine.boundingBox()).toEqual(frame);
    }
    await swipe(page,leaf,false); await expect(page.getByTestId('page-indicator')).toHaveText('36 / 39');
    await swipe(page,engine,true); await expect(page.getByTestId('page-indicator')).toHaveText('35 / 39');
    await swipe(page,leaf,true); await expect(page.getByTestId('page-indicator')).toHaveText('34 / 39');
    await goTo(page,27); await expect(index).toBeVisible();
    expect(await original!.evaluate(node=>node.isConnected)).toBe(true);
    await page.getByRole('button',{name:'Abrir pedido',exact:true}).tap();
    await expect(page.getByRole('dialog',{name:'Pedido',exact:true})).toContainText('Todavía no agregaste productos');
    expect(errors).toEqual([]);
  });
}

test('Artic Sport desktop/landscape retain original P35–P36 and native product hotspot',async ({page,isMobile})=>{
  if(isMobile) await page.setViewportSize({width:915,height:412});
  await page.goto('/'); await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/); await goTo(page,35);
  await expect(page.getByTestId('page-indicator')).toHaveText('35–36 / 39');
  await expect(page.locator('img[data-catalog-page="35"]')).toBeVisible();
  await expect(page.locator('.mobile-accessory-page, .mobile-accessory-editorial')).toHaveCount(0);
  await page.locator('.catalog-leaf[data-book-index="37"]').first().locator('button[data-product-id="artic sport"]').first().click();
  await expect(page.getByRole('dialog',{name:'Mochila Artic Sport',exact:true})).toBeVisible();
});
