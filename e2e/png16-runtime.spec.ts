import {readFileSync,writeFileSync} from 'node:fs';
import {expect,test,type Page} from '@playwright/test';
import type {CommerceCatalog} from '../src/commerce/types';

const catalog=JSON.parse(readFileSync('generated/products.json','utf8')) as CommerceCatalog;
const masters=JSON.parse(readFileSync('source-assets/product-masters/manifest.json','utf8')).files as {
  runtimePath:string|null; canonicalSource:string; width:number; height:number; productIds:string[];
}[];
const byRuntime=new Map(masters.filter(row=>row.runtimePath).map(row=>[row.runtimePath!,row]));
const products=catalog.products.filter(product=>product.imagenes.some(image=>byRuntime.has(image)));

async function goTo(page:Page,number:number) {
  await page.getByTestId('page-indicator').click();await page.locator('#page-number').fill(String(number));
  await page.locator('.page-picker button').click();
  await expect(page.locator('.catalog-app')).toHaveAttribute('data-book-transition','idle');
  await expect(page.getByTestId('page-flip-engine')).toHaveAttribute('data-flip-state','read');
}
test.beforeEach(async({page})=>{await page.route('https://api.real-step.com.ar/**',route=>route.abort());});

for(const product of products) {
  test(`${product.id}: every migrated photo loads at original zoom resolution and recovers from derivative failure`,async({page,isMobile},info)=>{
    test.setTimeout(120000);
    if(isMobile)await page.setViewportSize({width:390,height:844});
    let failDerivatives=false,failedDerivativeRequests=0;
    await page.route('**/catalog/product-images/**',route=>{
      if(failDerivatives){failedDerivativeRequests++;return route.fulfill({status:404,body:'Controlled missing derivative'});}
      return route.continue();
    });
    const paths:string[]=[];page.on('request',request=>paths.push(decodeURIComponent(new URL(request.url()).pathname)));
    const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto('/');await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);
    await goTo(page,product.pagina!);
    const hotspot=page.locator(`button[data-product-id="${product.id}"]:visible`).first();
    await hotspot.click();const dialog=page.getByRole('dialog',{name:product.nombre,exact:true});await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button',{name:/Ver imagen/})).toHaveCount(product.imagenes.length);
    const main=dialog.locator('.product-image-viewport img:not([aria-hidden="true"])');
    await expect.poll(()=>main.evaluate(node=>(node as HTMLImageElement).complete&&(node as HTMLImageElement).naturalWidth>0)).toBe(true);
    expect(paths.filter(path=>byRuntime.has(path.slice(1)))).toEqual([]); // Original web is still deferred.
    const observed=[];
    for(let index=0;index<product.imagenes.length;index++) {
      const source=product.imagenes[index],record=byRuntime.get(source);if(!record)continue;
      await dialog.getByRole('button',{name:`Ver imagen ${index+1}`,exact:true}).click();
      const reset=dialog.getByRole('button',{name:'Restablecer zoom',exact:true});
      if(await reset.isEnabled())await reset.click();
      await dialog.getByRole('button',{name:'Acercar imagen',exact:true}).click();
      await expect.poll(()=>main.evaluate(node=>decodeURIComponent(new URL((node as HTMLImageElement).currentSrc||window.location.href).pathname))).toBe('/'+source);
      await expect(async()=>{
        await main.evaluate(node=>(node as HTMLImageElement).decode());
      }).toPass({timeout:15000});
      // Chromium may retain the former srcset candidate's density correction
      // on the gallery element. Decode the same requested URL without srcset
      // to verify the actual original dimensions, rather than CSS pixels.
      expect(await main.evaluate(async node=>{
        const image=new Image();image.src=(node as HTMLImageElement).currentSrc;
        await image.decode();return[image.naturalWidth,image.naturalHeight];
      })).toEqual([record.width,record.height]);
      expect(paths).toContain('/'+source);
      expect(paths).not.toContain('/'+record.canonicalSource);
      observed.push({source,legacy:record.canonicalSource,width:record.width,height:record.height,zoom:true});
    }
    await dialog.getByRole('button',{name:'Restablecer zoom',exact:true}).click();
    if(['hard eva eternal','m hard eva black','black cap','neceser moss'].includes(product.id))await dialog.screenshot({path:info.outputPath('gallery-web-original.png')});
    await dialog.getByRole('button',{name:'Cerrar ficha',exact:true}).click();await page.mouse.move(0,0);
    // Force the normal/thumbnail fallback after the master PNGs have been archived.
    // Use a fresh document so decoded images from this gallery cannot bypass
    // the controlled HTTP failure through the renderer's image memory cache.
    failDerivatives=true;await page.reload();
    await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);
    await goTo(page,product.pagina!);await hotspot.click();await expect(dialog).toBeVisible();
    const first=product.imagenes[0];await expect.poll(()=>main.evaluate(node=>decodeURIComponent(new URL((node as HTMLImageElement).currentSrc||window.location.href).pathname))).toBe('/'+first);
    await main.evaluate(node=>(node as HTMLImageElement).decode());
    expect(failedDerivativeRequests).toBeGreaterThan(0);expect(errors).toEqual([]);
    writeFileSync(info.outputPath('observed-runtime.json'),JSON.stringify({productId:product.id,viewport:isMobile?'portrait':'desktop',observed,fallback:first},null,2));
  });
}
