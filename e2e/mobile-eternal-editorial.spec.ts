import {expect,test,type Page} from '@playwright/test';
test.beforeEach(async ({page}) => { await page.route('**/api/orders**', route => route.abort()); });
async function settled(page:Page) {
  await expect(page.locator('.catalog-app')).toHaveAttribute('data-book-transition','idle');
  await expect(page.getByTestId('page-flip-engine')).toHaveAttribute('data-flip-state','read');
}
async function index(page:Page) {
  await page.getByTestId('page-indicator').click();
  await page.locator('#page-number').fill('27');
  await page.locator('.page-picker button').click();
  await settled(page);
}
for (const [width,height] of [[320,640],[390,844],[412,915]] as const) {
  test(`Eternal portrait ${width}×${height}: recomposed real art, adjacent detail and return to index`, async ({page,isMobile},testInfo) => {
    test.skip(!isMobile,'Mobile portrait only');
    await page.setViewportSize({width,height}); await page.goto('/');
    await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);
    await index(page);
    await page.getByRole('button',{name:'Paletero Hard Eva Eternal: ver en página 29',exact:true}).tap();
    await settled(page);
    await expect(page.getByTestId('page-indicator')).toHaveText('SANYO / 39');
    const engine = page.getByTestId('page-flip-engine'), originalEngine = await engine.elementHandle();
    const intro = page.locator('.catalog-leaf[data-book-index="29"]').first().locator('.mobile-eternal-editorial');
    const bounds = (await intro.boundingBox())!, frame = (await engine.boundingBox())!;
    expect(bounds.height).toBeCloseTo(frame.height,0);
    await expect(intro.getByRole('heading',{name:'ETERNAL'})).toBeVisible();
    await expect(intro.getByText('COLLECTION',{exact:true})).toBeVisible();
    await expect(intro.getByText('by Sanyo Gutiérrez')).toBeVisible();
    await expect(intro.locator('button, [data-product-id], dl')).toHaveCount(0);
    await expect(intro).not.toContainText(/REF:|EAN:|DIMENSIONES|MATERIALES|EXPLORAR/);
    const heading = (await intro.locator('header').boundingBox())!;
    const signature = (await intro.getByRole('img',{name:'Firma de Sanyo Gutiérrez'}).boundingBox())!;
    const photo = (await intro.getByRole('img',{name:'Sanyo Gutiérrez junto al paletero Hard Eva Eternal'}).boundingBox())!;
    expect(heading.y+heading.height).toBeLessThan(signature.y);
    expect(signature.y+signature.height).toBeLessThan(photo.y);
    for (const image of await intro.locator('img').all()) {
      await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await expect(image).toHaveCSS('object-fit','contain');
    }
    await page.screenshot({path:testInfo.outputPath(`eternal-editorial-${width}.png`)});
    await page.getByRole('button',{name:'Página siguiente',exact:true}).tap(); await settled(page);
    await expect(page.getByTestId('page-indicator')).toHaveText('29 / 39');
    await expect(page.getByRole('heading',{name:'HARD EVA ETERNAL',exact:true})).toBeVisible();
    expect(await engine.boundingBox()).toEqual(frame);
    await page.getByRole('button',{name:'Página anterior',exact:true}).tap(); await settled(page);
    await expect(page.getByTestId('page-indicator')).toHaveText('SANYO / 39');
    await page.getByRole('button',{name:'Página anterior',exact:true}).tap(); await settled(page);
    await expect(page.getByTestId('page-indicator')).toHaveText('27 / 39');
    expect(await originalEngine!.evaluate(node => node.isConnected)).toBe(true);
  });
}
test('rotating from Eternal retains P29 and restores the original native Sanyo spread', async ({page,isMobile}) => {
  test.skip(!isMobile,'Phone rotation');
  await page.goto('/'); await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);
  await index(page);
  await page.getByRole('button',{name:'Paletero Hard Eva Eternal: ver en página 29',exact:true}).tap(); await settled(page);
  await page.getByRole('button',{name:'Página siguiente',exact:true}).tap(); await settled(page);
  await expect(page.getByTestId('page-indicator')).toHaveText('29 / 39');
  await page.setViewportSize({width:915,height:412});
  await expect(page.getByTestId('page-indicator')).toHaveText('29–SANYO / 39'); await settled(page);
  await expect(page.locator('.mobile-eternal-editorial')).toHaveCount(0);
  await expect(page.locator('img[data-catalog-page="29"]')).toBeVisible();
  await expect(page.locator('.sanyo-editorial__photo')).toHaveAttribute('src','/banners/sanyo-editorial-1920.webp');
  await page.setViewportSize({width:412,height:915});
  await expect(page.getByTestId('page-indicator')).toHaveText('29 / 39'); await settled(page);
  await expect(page.getByRole('heading',{name:'HARD EVA ETERNAL',exact:true})).toBeVisible();
});

test('rotation during entry cancels the old transition and keeps navigation available', async ({page,isMobile}) => {
  test.skip(!isMobile,'Phone rotation');
  await page.goto('/'); await expect(page.locator('.catalog-app')).toHaveClass(/cover-ready/);
  await index(page);
  await page.getByRole('button',{name:'Paletero Hard Eva Eternal: ver en página 29',exact:true}).tap();
  await expect(page.getByTestId('page-flip-engine')).toHaveAttribute('data-flip-state','flipping');
  await page.setViewportSize({width:915,height:412}); await settled(page);
  await expect(page.getByTestId('page-indicator')).toHaveText('27–28 / 39');
  await page.getByRole('button',{name:'Página siguiente',exact:true}).tap(); await settled(page);
  await expect(page.getByTestId('page-indicator')).toHaveText('29–SANYO / 39');
});
