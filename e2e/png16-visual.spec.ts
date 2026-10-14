import fs from 'node:fs/promises';import{test,expect}from'@playwright/test';
const diagnosis=JSON.parse(await fs.readFile('source-assets/product-masters/manifest.json','utf8'));
const samples=['Gorra 5.png','MOCHILA STARVIE HARD EVA BLACK.MAIN.png','PALETERO STARVIE HARD EVA ETERNAL.PT04.png','NECESER STARVIE MOSS.PT01.png'];
const selected=samples.map(name=>diagnosis.files.find(row=>row.originalPath.endsWith('/'+name)));
const missingMasters=(await Promise.all(selected.map(async row=>{
 try{await fs.access(row.masterPath);return null;}catch(error){if(error.code==='ENOENT')return row.masterPath;throw error;}
}))).filter(Boolean);
test('browser sRGB comparison of 16-bit editing originals and full-resolution lossless WebP',async({page},info)=>{
 test.skip(missingMasters.length>0,'Optional PNG16 comparison requires the ignored local archive; runtime tests and build checks remain mandatory.');
 test.setTimeout(180000);await page.route('https://api.real-step.com.ar/**',route=>route.abort());
 await page.route('**/__png16/*',async route=>{const [kind,index]=new URL(route.request().url()).pathname.split('/').at(-1).split('-');const n=Number(index),row=selected[n];const data=await fs.readFile(kind==='original'?row.masterPath:'public/'+row.runtimePath);await route.fulfill({contentType:kind==='original'?'image/png':'image/webp',body:data});});
 await page.goto('/');
 const results=[];
 for(let i=0;i<selected.length;i++){
 await page.setContent(`<style>body{margin:0;background:#0f1318;color:#dfe5eb;font:14px Arial}.pair{display:flex;gap:20px;padding:10px}.tile{width:380px}img{width:380px;height:420px;object-fit:contain}.white{background:#f3f3f3}.dark{background:#171c24}</style><h2>Original PNG16 / WebP lossless8: ${samples[i]}</h2><div class="pair"><div class="tile white"><img id="original" src="/__png16/original-${i}"></div><div class="tile white"><img id="optimized" src="/__png16/optimized-${i}"></div></div><div class="pair"><div class="tile dark"><img src="/__png16/original-${i}"></div><div class="tile dark"><img src="/__png16/optimized-${i}"></div></div>`);
 await page.locator('img').evaluateAll(async imgs=>{await Promise.all(imgs.map(img=>img.decode()))});
 const metric=await page.evaluate(()=>{const a=document.querySelector('#original'),b=document.querySelector('#optimized');const canvasA=document.createElement('canvas'),canvasB=document.createElement('canvas');for(const c of[canvasA,canvasB]){c.width=760;c.height=840}const ctxA=canvasA.getContext('2d',{colorSpace:'srgb',willReadFrequently:true}),ctxB=canvasB.getContext('2d',{colorSpace:'srgb',willReadFrequently:true});const scale=Math.min(760/a.naturalWidth,840/a.naturalHeight),w=a.naturalWidth*scale,h=a.naturalHeight*scale;let max=0,total=0,changed=0;for(const bg of['#171c24','#f3f3f3']){for(const ctx of[ctxA,ctxB]){ctx.fillStyle=bg;ctx.fillRect(0,0,760,840)}ctxA.drawImage(a,(760-w)/2,(840-h)/2,w,h);ctxB.drawImage(b,(760-w)/2,(840-h)/2,w,h);const one=ctxA.getImageData(0,0,760,840).data,two=ctxB.getImageData(0,0,760,840).data;for(let k=0;k<one.length;k++){const d=Math.abs(one[k]-two[k]);max=Math.max(max,d);total+=d;if(d)changed++;}}return{maxChannelDelta:max,meanChannelDelta:total/(760*840*4*2),changedChannels:changed,natural:[a.naturalWidth,a.naturalHeight,b.naturalWidth,b.naturalHeight]};});
 results.push({source:selected[i].canonicalSource,...metric});console.log(results.at(-1));expect(metric.meanChannelDelta).toBeLessThan(.01);expect(metric.maxChannelDelta).toBeLessThanOrEqual(2);expect(metric.natural.slice(0,2)).toEqual(metric.natural.slice(2));await page.screenshot({path:info.outputPath('comparison-'+i+'.png'),fullPage:true});
 }
 await fs.writeFile(info.outputPath('browser-comparison.json'),JSON.stringify(results,null,2));
});
