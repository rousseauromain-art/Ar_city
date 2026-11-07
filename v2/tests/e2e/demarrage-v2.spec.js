// Démarrage : la dernière position (avec son heure) et le dernier relief calculé sont gardés ; à la réouverture, sans GPS,
// la page affiche tout de suite « position de HH:MM » et la ligne d'horizon gardée (relief provisoire), jusqu'au premier fix.
const {test,expect}=require('@playwright/test');
const zlib=require('zlib');

function png1x1(){
  const crcTable=Array.from({length:256},(_,n)=>{ let c=n; for(let k=0;k<8;k++) c=c&1?0xedb88320^(c>>>1):c>>>1; return c>>>0; });
  const crc=b=>{ let c=0xffffffff; for(const x of b) c=crcTable[(c^x)&255]^(c>>>8); return (c^0xffffffff)>>>0; };
  const bloc=(type,data)=>{ const t=Buffer.from(type), l=Buffer.alloc(4), c=Buffer.alloc(4); l.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t,data]))); return Buffer.concat([l,t,data,c]); };
  const ihdr=Buffer.alloc(13); ihdr.writeUInt32BE(1,0); ihdr.writeUInt32BE(1,4); ihdr[8]=8; ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),bloc('IHDR',ihdr),bloc('IDAT',zlib.deflateSync(Buffer.from([0,128,0,0,255]))),bloc('IEND',Buffer.alloc(0))]);
}

test('réouverture sans GPS : « position de HH:MM » et relief du dernier démarrage, puis le GPS reprend la main',async({browser})=>{
  const ctx=await browser.newContext({viewport:{width:915,height:412},hasTouch:true,locale:'fr-FR',timezoneId:'Europe/Paris',baseURL:`http://127.0.0.1:${+(process.env.PORT||4173)}`,permissions:['geolocation','camera'],geolocation:{latitude:48.6459,longitude:-2.0281,accuracy:8}});
  await ctx.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await ctx.route(/tiles\.mapterhorn\.com\/.*\.webp$/,r=>r.fulfill({status:200,contentType:'image/png',body:png1x1()}));
  await ctx.addInitScript(()=>{ try{ if(!localStorage.getItem('vh2:reglages')) localStorage.setItem('vh2:reglages',JSON.stringify({v:1,d:{radius:20,calculRelief:true,skyline:true,relief:true}})); }catch(e){} });
  const erreurs=[];
  // 1. première ouverture : GPS, relief calculé et gardé
  let page=await ctx.newPage(); page.on('pageerror',e=>erreurs.push(String(e)));
  await page.goto('/v2/ar.html'); await page.click('#go');
  await expect.poll(()=>page.evaluate(()=>{ const t=window.__vh2.app.donnees().terrain; return !!t&&!t.provisoire&&window.__vh2.app.etat().etatRelief==='ok'; }),{timeout:40000}).toBe(true);
  await expect.poll(()=>page.evaluate(async()=>!!(await (await caches.open('vh2-demarrage')).match('https://vh2.local/relief'))),{timeout:10000}).toBe(true);
  const heure=await page.evaluate(()=>{ const p=JSON.parse(localStorage.getItem('vh2:dernierePosition')); const d=new Date((p.d||p).t); return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'); });
  await page.close();
  // 2. réouverture sans GPS (permission retirée) : position et relief gardés, tout de suite
  await ctx.clearPermissions(); await ctx.grantPermissions(['camera']);
  await ctx.unroute(/tiles\.mapterhorn\.com\/.*\.webp$/); await ctx.route(/tiles\.mapterhorn\.com\/.*\.webp$/,r=>r.abort());
  page=await ctx.newPage(); page.on('pageerror',e=>erreurs.push(String(e)));
  await page.goto('/v2/ar.html');
  await expect.poll(()=>page.evaluate(()=>{ const d=window.__vh2&&window.__vh2.app.donnees(); return !!(d&&d.pos&&d.terrain&&d.terrain.provisoire); }),{timeout:5000}).toBe(true);
  await page.click('#go');
  await expect(page.locator('#status')).toContainText(`position de ${heure}`);
  const pos=await page.evaluate(()=>window.__vh2.app.donnees().pos);
  expect(Math.abs(pos.lat-48.6459)).toBeLessThan(1e-4);
  // la ligne d'horizon est dessinée sans verdicts (relief provisoire, sans tuiles)
  expect(await page.evaluate(()=>window.__vh2.app.donnees().terrain.pm.length)).toBe(720);
  // 3. le GPS revient : le libellé disparaît
  await ctx.grantPermissions(['geolocation','camera']); await ctx.setGeolocation({latitude:48.6460,longitude:-2.0282,accuracy:8});
  await page.evaluate(()=>window.__vh2.entree&&window.__vh2.entree.demarrer&&window.__vh2.entree.demarrer());
  await expect(page.locator('#status')).not.toContainText('position de',{timeout:15000});
  expect(erreurs).toEqual([]); await ctx.close();
});
