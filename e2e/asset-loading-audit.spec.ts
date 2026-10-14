import {expect,test,type Page} from '@playwright/test';

async function goTo(page:Page,number:number) {
  await page.getByTestId('page-indicator').click();await page.locator('#page-number').fill(String(number));
  await page.locator('.page-picker button').click();
  await expect(page.locator('.catalog-app')).toHaveAttribute('data-book-transition','idle');
  await expect(page.getByTestId('page-flip-engine')).toHaveAttribute('data-flip-state','read');
}
test.beforeEach(async ({page}) => {await page.route('**/api/orders**',route=>route.abort());});

test('portrait warms only current replacement media, without discarded hero or accessory PDF requests',async ({page,isMobile}) => {
  test.skip(!isMobile,'Portrait request window');
  await page.setViewportSize({width:390,height:844});
  const paths:string[]=[];page.on('request',request=>paths.push(new URL(request.url()).pathname));
  await page.goto('/');await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);
  await goTo(page,27);
  await expect(page.locator('.catalog-leaf[data-book-index="27"]').first().locator('.mobile-accessory-index')).toBeVisible();
  await goTo(page,37);
  await expect(page.locator('.catalog-leaf[data-book-index="39"]').first().locator('.mobile-accessory-pair')).toBeVisible();
  await goTo(page,38);
  const leaf=page.locator('.catalog-leaf[data-book-index="40"]').first();
  await expect(leaf.locator('[data-showcase-source]')).toHaveCount(9);
  await Promise.all((await leaf.locator('[data-showcase-source]').all()).map(img=>img.evaluate(node=>(node as HTMLImageElement).decode())));
  expect(paths.filter(p=>p.startsWith('/hero/'))).toEqual([]);
  expect(paths.filter(p=>/^\/catalog\/pages\/page-(2[7-9]|3[0-6])\.webp$/.test(p))).toEqual([]);
  // P37/P38 are also used by the physical rear-cover bridge. Those two native
  // surfaces remain intentionally intact; they are not the portrait warmup.
  await expect(page.locator('.back-cover-bridge [data-rear-bridge-page="left"] img')).toHaveAttribute('src','/catalog/pages/page-37.webp');
  await expect(page.locator('.back-cover-bridge [data-rear-bridge-page="right"] img')).toHaveAttribute('src','/catalog/pages/page-38.webp');
  // P36 Black Voltage is a legitimate neighbour while reading P37.
  expect(paths.filter(p=>/^\/mobile\/(artic-sport|hard-eva-black-backpack-front)/.test(p))).toEqual([]);
  expect(paths.filter(p=>p.includes('hard-eva-black-backpack.webp'))).toEqual([]);
  // Key Ring's fallback still paints the native PDF, even if the rear bridge
  // already decoded the same resource. Removing warmup must not remove the file.
  await leaf.getByRole('button',{name:'Explorar Key Ring',exact:true}).tap();
  const dialog=page.getByRole('dialog',{name:'Key Ring',exact:true});await expect(dialog).toBeVisible();
  await expect(dialog.locator('img[src$="/catalog/pages/page-38.webp"]')).toBeVisible();
  await expect.poll(()=>paths.includes('/catalog/pages/page-38.webp')).toBe(true);
  await dialog.getByRole('button',{name:'Cerrar ficha',exact:true}).tap();await page.mouse.move(0,0);
  await goTo(page,37);await expect(page.getByTestId('page-indicator')).toHaveText('37 / 39');
});

test('desktop and landscape still warm native PDFs and retain modal original/zoom assets',async ({page,isMobile}) => {
  if(isMobile)await page.setViewportSize({width:915,height:412});
  const paths:string[]=[];page.on('request',request=>paths.push(decodeURIComponent(new URL(request.url()).pathname)));
  await page.goto('/');await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);await goTo(page,38);
  await expect(page.locator('.mobile-accessory-page')).toHaveCount(0);
  await expect.poll(()=>paths.includes('/catalog/pages/page-38.webp')).toBe(true);
  const leaf=page.locator('.catalog-leaf[data-book-index="40"]').first();
  await leaf.locator('button[data-product-id="overgrip premier soft"]').click();
  const dialog=page.getByRole('dialog',{name:'Overgrip Premier Soft',exact:true});await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button',{name:/Ver imagen/})).toHaveCount(2);
  await dialog.getByRole('button',{name:'Cerrar ficha',exact:true}).click();await page.mouse.move(0,0);
  await expect(page.getByTestId('page-indicator')).toHaveText('37–38 / 39');
});
