import {expect,test,type Page,type Locator} from '@playwright/test';

const cases=[
  {title:'NAVY',name:'Neceser Navy',id:'neceser navy',source:'neceser-navy.webp',ref:'NSTNAVY51000',ean:'8436612942216',size:[1400,730]},
  {title:'MOSS',name:'Neceser Moss',id:'neceser moss',source:'neceser-moss.webp',ref:'NSTMOSS51000',ean:'8436612942223',size:[1400,724]},
] as const;
test.beforeEach(async ({page})=>{await page.route('**/api/orders**',route=>route.abort());});
async function settled(page:Page) {
  await expect(page.locator('.catalog-app')).toHaveAttribute('data-book-transition','idle');
  await expect(page.getByTestId('page-flip-engine')).toHaveAttribute('data-flip-state','read');
}
async function goTo(page:Page,number:number) {
  await page.getByTestId('page-indicator').click(); await page.locator('#page-number').fill(String(number));
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
  } finally {await cdp.detach();}
  await settled(page);
}

for(const [width,height] of [[320,640],[375,667],[360,740],[390,844],[412,915]] as const) {
  test(`Necessaires portrait ${width}×${height}: one leaf, two real products, correct six modal actions and swipes`,async ({page,isMobile},testInfo)=>{
    test.skip(!isMobile,'Portrait phones only');
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setViewportSize({width,height}); await page.goto('/');
    await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/); await goTo(page,27);
    const engine=page.getByTestId('page-flip-engine'),original=await engine.elementHandle(),frame=await engine.boundingBox();
    const index=page.locator('.catalog-leaf[data-book-index="27"]').first().locator('.mobile-accessory-index');
    const leaf=page.locator('.catalog-leaf[data-book-index="39"]').first().getByRole('article',{name:'Página 37, NECESERES'});
    for(const item of cases) {
      await index.getByRole('region',{name:'Accesorios',exact:true}).getByRole('button',{name:`${item.name}: ver en página 37`,exact:true}).tap(); await settled(page);
      await expect(page.getByTestId('page-indicator')).toHaveText('37 / 39');
      await expect(leaf).toBeVisible();
      await expect(leaf.getByRole('heading',{name:'NECESERES',exact:true})).toBeVisible();
      await expect(leaf.getByRole('region')).toHaveCount(2);
      await goTo(page,27);
    }
    await goTo(page,37);
    const pageBox=(await leaf.boundingBox())!;
    const navyBox=(await leaf.getByRole('region',{name:'NAVY',exact:true}).boundingBox())!;
    const mossBox=(await leaf.getByRole('region',{name:'MOSS',exact:true}).boundingBox())!;
    expect(navyBox.x).toBeCloseTo(mossBox.x,1); expect(navyBox.width).toBeCloseTo(mossBox.width,1);
    expect(navyBox.y+navyBox.height).toBeLessThan(mossBox.y);
    expect(mossBox.y+mossBox.height).toBeLessThan(pageBox.y+pageBox.height);
    await expect(leaf.locator('.mobile-court-scene')).toBeVisible();
    for(const item of cases) {
      const block=leaf.getByRole('region',{name:item.title,exact:true});
      const box=(await block.boundingBox())!,photo=block.getByRole('img',{name:item.title,exact:true});
      await expect(photo).toHaveAttribute('src',new RegExp(`mobile/${item.source.replace('.', '\\.')}$`));
      await photo.evaluate(node=>(node as HTMLImageElement).decode());
      expect(await photo.evaluate(node=>[(node as HTMLImageElement).naturalWidth,(node as HTMLImageElement).naturalHeight])).toEqual(item.size);
      await expect(photo).toHaveCSS('object-fit','contain');
      await expect(block.locator('dd')).toHaveText('PVC RUBBER');
      await expect(block).toContainText(`REF: ${item.ref}`); await expect(block).toContainText(`EAN: ${item.ean}`);
      const bag=block.getByRole('button',{name:`Ver ficha y opciones de pedido de ${item.name}`,exact:true});
      const bagBox=(await bag.boundingBox())!,ctaBox=(await block.getByRole('button',{name:`Explorar ${item.name}`,exact:true}).boundingBox())!;
      expect(bagBox.width).toBe(44);expect(bagBox.height).toBe(44);
      expect(bagBox.x+bagBox.width).toBeCloseTo(box.x+box.width,1);expect(bagBox.y).toBeCloseTo(box.y,1);
      expect(ctaBox.height).toBeGreaterThanOrEqual(44);
      const drawn=await photo.evaluate(node=>{
        const img=node as HTMLImageElement,rect=img.getBoundingClientRect();
        const scale=Math.min(rect.width/img.naturalWidth,rect.height/img.naturalHeight);
        return {y:rect.bottom-img.naturalHeight*scale,bottom:rect.bottom,width:img.naturalWidth*scale};
      });
      expect(drawn.width/pageBox.width).toBeGreaterThan(.50);
      expect(drawn.y).toBeGreaterThan(bagBox.y+bagBox.height);
      const details=(await block.locator('.mobile-accessory-pair__details').boundingBox())!;
      expect(drawn.bottom).toBeLessThan(details.y);
      for(const node of await block.locator('h2, .mobile-accessory-pair__details, .mobile-accessory-product__explore').all()) {
        const overflow=await node.evaluate(el=>({tag:el.tagName,text:el.textContent,w:el.clientWidth,sw:el.scrollWidth,h:el.clientHeight,sh:el.scrollHeight}));
        expect(overflow.sw,JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.w+1);expect(overflow.sh,JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.h+1);
      }
    }
    await page.screenshot({path:testInfo.outputPath(`necessaires-${width}.png`)});
    for(const item of cases) {
      const block=leaf.getByRole('region',{name:item.title,exact:true});
      for(const name of [`Abrir ficha de ${item.name}`,`Ver ficha y opciones de pedido de ${item.name}`,`Explorar ${item.name}`]) {
        await block.getByRole('button',{name,exact:true}).tap();
        const modal=page.getByRole('dialog',{name:item.name,exact:true});await expect(modal).toBeVisible();
        await expect(modal.getByRole('button',{name:/Ver imagen/})).toHaveCount(4);
        await expect(modal.locator('img[src*="/mobile/"]')).toHaveCount(0);
        await modal.getByRole('button',{name:'Cerrar ficha',exact:true}).tap();await page.mouse.move(0,0);
        await expect(modal).toHaveCount(0);await settled(page);
        await expect(page.getByTestId('page-indicator')).toHaveText('37 / 39');expect(await engine.boundingBox()).toEqual(frame);
      }
    }
    await swipe(page,leaf,true);await expect(page.getByTestId('page-indicator')).toHaveText('36 / 39');
    await swipe(page,engine,false);await expect(page.getByTestId('page-indicator')).toHaveText('37 / 39');
    await swipe(page,leaf,false);await expect(page.getByTestId('page-indicator')).toHaveText('38 / 39');
    await swipe(page,engine,true);await expect(page.getByTestId('page-indicator')).toHaveText('37 / 39');
    expect(await original!.evaluate(node=>node.isConnected)).toBe(true);
    await page.getByRole('button',{name:'Abrir pedido',exact:true}).tap();
    await expect(page.getByRole('dialog',{name:'Pedido',exact:true})).toContainText('Todavía no agregaste productos');
    expect(errors).toEqual([]);
  });
}

test('Necessaires desktop/landscape retain native P37–P38, both original product hotspots and modal identities',async ({page,isMobile})=>{
  if(isMobile)await page.setViewportSize({width:915,height:412});
  await page.goto('/');await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);await goTo(page,37);
  await expect(page.getByTestId('page-indicator')).toHaveText('37–38 / 39');
  await expect(page.locator('img[data-catalog-page="37"]')).toBeVisible();
  await expect(page.locator('.mobile-accessory-page')).toHaveCount(0);
  for(const item of cases) {
    await page.locator('.catalog-leaf[data-book-index="39"]').first().locator(`button[data-product-id="${item.id}"]`).first().click();
    const modal=page.getByRole('dialog',{name:item.name,exact:true});await expect(modal).toBeVisible();
    await modal.getByRole('button',{name:'Cerrar ficha',exact:true}).click();await page.mouse.move(0,0);await settled(page);
  }
});
