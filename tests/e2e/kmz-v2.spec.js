// Couches personnelles KMZ / KML dans la v2 : import d'un fichier (KML puis KMZ), affichage dans la bande, fiche au toucher, mémorisation sur l'appareil, suppression. Lu dans le navigateur, jamais envoyé.
const {test,expect}=require('@playwright/test');
const zlib=require('zlib');

const KML=`<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
<Placemark><name>Antenne Nord</name><description>Mât de test</description><ExtendedData><Data name="Opérateur"><value>Test SA</value></Data><Data name="Hauteur"><value>42</value></Data></ExtendedData><Point><coordinates>-2.0281,48.6559,0</coordinates></Point></Placemark>
<Placemark><name>Antenne Est</name><Point><coordinates>-2.0000,48.6459,0</coordinates></Point></Placemark>
<Placemark><name>Chemin</name><LineString><coordinates>-2.0,48.6,0 -2.1,48.7,0</coordinates></LineString></Placemark>
</Document></kml>`;

/** KMZ minimal : une seule entrée doc.kml, stockée (sans compression). */
function kmz(texte){
  const nom=Buffer.from('doc.kml'), data=Buffer.from(texte), crc=zlib.crc32(data);
  const loc=Buffer.alloc(30); loc.writeUInt32LE(0x04034b50,0); loc.writeUInt16LE(20,4); loc.writeUInt32LE(crc,14); loc.writeUInt32LE(data.length,18); loc.writeUInt32LE(data.length,22); loc.writeUInt16LE(nom.length,26);
  const cen=Buffer.alloc(46); cen.writeUInt32LE(0x02014b50,0); cen.writeUInt16LE(20,4); cen.writeUInt16LE(20,6); cen.writeUInt32LE(crc,16); cen.writeUInt32LE(data.length,20); cen.writeUInt32LE(data.length,24); cen.writeUInt16LE(nom.length,28); cen.writeUInt32LE(0,42);
  const debutCentral=loc.length+nom.length+data.length, tailleCentral=cen.length+nom.length;
  const fin=Buffer.alloc(22); fin.writeUInt32LE(0x06054b50,0); fin.writeUInt16LE(1,8); fin.writeUInt16LE(1,10); fin.writeUInt32LE(tailleCentral,12); fin.writeUInt32LE(debutCentral,16);
  return Buffer.concat([loc,nom,data,cen,nom,fin]);
}

async function ouvrir(browser){
  const ctx=await browser.newContext({viewport:{width:915,height:412},deviceScaleFactor:2,hasTouch:false,baseURL:`http://127.0.0.1:${+(process.env.PORT||4173)}`,permissions:['geolocation','camera'],geolocation:{latitude:48.6459,longitude:-2.0281}});
  const page=await ctx.newPage(), erreurs=[], requetes=[]; page.on('pageerror',e=>erreurs.push(String(e))); page.on('request',r=>{ if(!/^http:\/\/127\.0\.0\.1/.test(r.url())) requetes.push(r.url()); });
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.addInitScript(()=>{ try{ localStorage.setItem('vh2:reglages',JSON.stringify({v:1,d:{radius:30,calculRelief:false,relief:false,skyline:false}})); }catch(e){} });
  await page.goto('/v2/ar.html'); await page.click('#go');
  await expect.poll(()=>page.evaluate(()=>!!window.__vh2.app.donnees().pos),{timeout:15000}).toBe(true);
  return {ctx,page,erreurs,requetes};
}
const importer=async(page,nom,mime,buffer)=>{ await page.evaluate(()=>document.getElementById('lyUserMgr').click()); await page.setInputFiles('#usrFile',{name:nom,mimeType:mime,buffer}); };

test('KML puis KMZ : couche ajoutée, sites dans la bande, fiche au toucher, mémorisée après rechargement, supprimée',async({browser})=>{
  const {ctx,page,erreurs,requetes}=await ouvrir(browser);
  await importer(page,'pylones.kml','application/vnd.google-earth.kml+xml',Buffer.from(KML));
  await expect(page.locator('#usrMsg')).toContainText('2 point(s)');
  await expect(page.locator('#usrMsg')).toContainText('1 ligne(s)/polygone(s) ignorés');
  expect(await page.evaluate(()=>window.__vh2.app.couchesPerso().map(L=>[L.name,L.pts.length,L.shown.length]))).toEqual([['pylones',2,2]]);
  expect(await page.evaluate(()=>document.getElementById('lyUser').textContent)).toContain('pylones');
  // KMZ (archive ZIP)
  await page.setInputFiles('#usrFile',{name:'autre.kmz',mimeType:'application/vnd.google-earth.kmz',buffer:kmz(KML)});
  await expect(page.locator('#usrMsg')).toContainText('autre');
  expect(await page.evaluate(()=>window.__vh2.app.couchesPerso().length)).toBe(2);
  expect(await page.evaluate(()=>window.__vh2.app.couchesPerso()[1].pts.length)).toBe(2);
  // seule la 1re couche reste : on supprime la 2e
  page.on('dialog',d=>d.accept());
  await page.evaluate(()=>{ const b=[...document.querySelectorAll('[data-f="del"]')][1]; b.click(); });
  await expect.poll(()=>page.evaluate(()=>window.__vh2.app.couchesPerso().length)).toBe(1);
  // les sites s'affichent dans la bande : cap vers le nord, une zone « bande » de la couche existe
  await page.evaluate(()=>document.getElementById('dbg').classList.remove('open'));
  await page.evaluate(()=>{ for(let i=0;i<200;i++) window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute',{alpha:0,beta:90,gamma:0,absolute:true})); });
  const zone=()=>page.evaluate(()=>{ const b=window.__vh2.bilan(), z=b&&b.zones&&b.zones.bande.find(z=>z.element&&z.element.source&&z.element.source.kind==='user'&&z.element.nom==='Antenne Nord'); return z?{x:(z.x0+z.x1)/2,y:(z.y0+z.y1)/2}:null; });
  await expect.poll(zone,{timeout:20000,message:'le site de la couche doit être dans la bande'}).not.toBeNull();
  const p=await zone(), r=await page.evaluate(()=>{ const b=document.getElementById('ov').getBoundingClientRect(); return {x:b.left,y:b.top}; });
  await page.mouse.click(r.x+p.x,r.y+p.y);
  await expect(page.locator('#fiche')).toBeVisible();
  await expect(page.locator('#ficheBody')).toContainText('Antenne Nord');
  await expect(page.locator('#ficheBody')).toContainText('Test SA');
  // mémorisée sur l'appareil : rechargement
  await page.reload(); await page.click('#go');
  await expect.poll(()=>page.evaluate(()=>window.__vh2.app.couchesPerso().length),{timeout:15000}).toBe(1);
  await expect(page.locator('#lyUser')).toContainText('pylones');
  // supprimer la dernière
  await page.evaluate(()=>document.getElementById('lyUserMgr').click());
  await page.evaluate(()=>document.querySelector('[data-f="del"]').click());
  await expect.poll(()=>page.evaluate(()=>window.__vh2.app.couchesPerso().length)).toBe(0);
  expect(requetes.filter(u=>/kml|kmz|pylones|vh\.user/i.test(u)),'aucune requête réseau pour les points').toEqual([]);
  expect(erreurs).toEqual([]); await ctx.close();
});
