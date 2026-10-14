import { expect, test, type Page, type Locator } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { CommerceCatalog } from '../src/commerce/types';
import { mobileAccessoryShowcaseGroups } from '../src/data/mobileAccessoryShowcase';

const items = mobileAccessoryShowcaseGroups.flatMap(group => group.items);
const catalog = JSON.parse(readFileSync('generated/products.json','utf8')) as CommerceCatalog;
test.beforeEach(async ({page}) => {await page.route('**/api/orders**',route => route.abort());});
async function settled(page:Page) {
  await expect(page.locator('.catalog-app')).toHaveAttribute('data-book-transition','idle');
  await expect(page.getByTestId('page-flip-engine')).toHaveAttribute('data-flip-state','read');
}
async function goTo(page:Page,number:number) {
  await page.getByTestId('page-indicator').click();await page.locator('#page-number').fill(String(number));
  await page.locator('.page-picker button').click();await settled(page);
}
async function swipe(page:Page,target:Locator,previous:boolean) {
  const box=(await target.boundingBox())!,x=box.x+box.width*(previous?.025:.975),y=box.y+box.height*.55;
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
  test(`P38 portrait showcase ${width}×${height}: real photos, legible categories and native navigation`,async ({page,isMobile},testInfo) => {
    test.setTimeout(90_000);
    test.skip(!isMobile,'Portrait phones only');
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setViewportSize({width,height});await page.goto('/');
    await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);await goTo(page,38);
    const engine=page.getByTestId('page-flip-engine'),original=await engine.elementHandle();
    const leaf=page.locator('.catalog-leaf[data-book-index="40"]').first().getByRole('article',{name:'Página 38, accesorios StarVie'});
    await expect(page.getByTestId('page-indicator')).toHaveText('38 / 39');
    await expect(leaf).toBeVisible();await expect(leaf.getByRole('region')).toHaveCount(6);
    await expect(leaf.locator('.mobile-court-scene')).toBeVisible();
    const pageBox=(await leaf.boundingBox())!;
    for(const group of mobileAccessoryShowcaseGroups) {
      const region=leaf.getByRole('region',{name:group.category,exact:true}),rect=(await region.boundingBox())!;
      expect(rect.y).toBeGreaterThan(pageBox.y);expect(rect.y+rect.height).toBeLessThan(pageBox.y+pageBox.height);
      for(const item of group.items) {
        const product=catalog.products.find(product=>product.id===item.productId)!;
        const photo=region.getByRole('img',{name:item.title,exact:true});await photo.evaluate(node=>(node as HTMLImageElement).decode());
        await expect(photo).toHaveAttribute('data-showcase-source',item.image);
        await expect(photo).toHaveCSS('object-fit','contain');
        expect(await photo.evaluate(node=>(node as HTMLImageElement).naturalWidth)).toBeGreaterThan(100);
        const explore=region.getByRole('button',{name:`Explorar ${product.nombre}`,exact:true});
        const bag=region.getByRole('button',{name:`Ver ficha y opciones de pedido de ${product.nombre}`,exact:true});
        const bagBox=(await bag.boundingBox())!;expect(bagBox.width).toBe(44);expect(bagBox.height).toBe(44);
        expect(bagBox.x+bagBox.width).toBeLessThanOrEqual(rect.x+rect.width);
        const label=explore.locator('strong');
        const metrics=await label.evaluate(el=>({w:el.clientWidth,sw:el.scrollWidth,h:el.clientHeight,sh:el.scrollHeight}));
        expect(metrics.sw).toBeLessThanOrEqual(metrics.w+1);expect(metrics.sh).toBeLessThanOrEqual(metrics.h+1);
        const labelBox=(await label.boundingBox())!;expect(labelBox.y,item.title).toBeGreaterThan(bagBox.y+bagBox.height);
      }
    }
    await page.screenshot({path:testInfo.outputPath(`accessories-${width}.png`)});
    if(width===390) {
      // Both photo/label and the bag use the unchanged commercial modal, including
      // Key Ring's existing PDF fallback rather than a new commerce/gallery asset.
      for(const item of items) {
        const product=catalog.products.find(product=>product.id===item.productId)!;
        for(const name of [`Explorar ${product.nombre}`,`Ver ficha y opciones de pedido de ${product.nombre}`]) {
          await leaf.getByRole('button',{name,exact:true}).tap();
          const modal=page.getByRole('dialog',{name:product.nombre,exact:true});await expect(modal).toBeVisible();
          await expect(modal.locator('img[src*="/mobile/"]')).toHaveCount(0);
          await modal.getByRole('button',{name:'Cerrar ficha',exact:true}).tap();await page.mouse.move(0,0);await settled(page);
          await expect(page.getByTestId('page-indicator')).toHaveText('38 / 39');
        }
      }
      await page.getByRole('button',{name:'Abrir pedido',exact:true}).tap();
      const cart=page.getByRole('dialog',{name:'Pedido',exact:true});await expect(cart).toContainText('Todavía no agregaste productos');
      await cart.getByRole('button',{name:'Cerrar pedido',exact:true}).tap();
    }
    await swipe(page,leaf,true);await expect(page.getByTestId('page-indicator')).toHaveText('37 / 39');
    await swipe(page,engine,false);await expect(page.getByTestId('page-indicator')).toHaveText('38 / 39');
    await goTo(page,39);await expect(page.getByTestId('page-indicator')).toHaveText('CONTRATAPA / 39');
    await goTo(page,38);await expect(leaf).toBeVisible();
    expect(await original!.evaluate(node=>node.isConnected)).toBe(true);expect(errors).toEqual([]);
  });
}

test('P38 desktop/landscape keep the original PDF spread and all nine native hotspots',async ({page,isMobile}) => {
  if(isMobile)await page.setViewportSize({width:915,height:412});
  await page.goto('/');await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);await goTo(page,38);
  await expect(page.getByTestId('page-indicator')).toHaveText('37–38 / 39');
  await expect(page.locator('img[data-catalog-page="38"]')).toBeVisible();
  await expect(page.locator('.mobile-accessory-showcase')).toHaveCount(0);
  const leaf=page.locator('.catalog-leaf[data-book-index="40"]').first();
  for(const item of items) await expect(leaf.locator(`button[data-product-id="${item.productId}"]`)).toHaveCount(1);
});
