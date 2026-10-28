// Le masque du relief calculé dans un Worker (src/workers/masque-relief.js) est identique à celui du fil principal.
const {test,expect}=require('@playwright/test');

test('masque du relief : Worker = fil principal, bit à bit, tuiles rendues',async({page})=>{
  test.setTimeout(180000);
  const erreurs=[]; page.on('pageerror',e=>erreurs.push(String(e)));
  await page.route(/^(?!http:\/\/127\.0\.0\.1[:/])/,r=>r.abort());
  await page.goto('/v2/outils.html');
  const r=await page.evaluate(async()=>{
    const rel=await import('/src/scene/relief.js'), mq=await import('/src/scene/masque.js'), mw=await import('/src/scene/masque-worker.js');
    const POS={lat:48.6459,lon:-2.0281}, bands=rel.creerBandes(rel.BANDES_HR,POS);
    const alt=(lat,lon)=>Math.max(0,40+90*Math.sin(lat*120)*Math.cos(lon*95)+60*Math.sin(lat*31+lon*17)+Math.exp(-(((lat-48.75)*400)**2))*260);
    for(const b of bands){ const n=b.ts*2**b.z;
      for(let iy=0;iy<b.ny;iy++) for(let ix=0;ix<b.nx;ix++){
        if(!b.garantie&&(ix+iy)%2) continue; // relief fin incomplet
        const t=new Uint8ClampedArray(b.ts*b.ts*4);
        for(let py=0;py<b.ts;py++){ const lat=Math.atan(Math.sinh(Math.PI*(1-2*((b.ty0+iy)*b.ts+py+0.5)/n)))*180/Math.PI;
          for(let px=0;px<b.ts;px++){ const lon=((b.tx0+ix)*b.ts+px+0.5)/n*360-180, v=alt(lat,lon)+32768, i=(py*b.ts+px)*4;
            t[i]=Math.floor(v/256); t[i+1]=Math.floor(v)%256; t[i+2]=Math.round((v%1)*256); t[i+3]=255; } }
        b.tiles[iy*b.nx+ix]=t; } }
    const t0=performance.now(), ref=await mq.calculerMasque(bands,POS,15.6,async()=>{}), msPrincipal=performance.now()-t0;
    const calcul=mw.creerMasqueWorker(new URL('/src/workers/masque-relief.js',location.href));
    const avant=bands.map(b=>b.tiles.map(t=>t&&t.length));
    const t1=performance.now(), pm=await calcul(bands,POS,15.6), msWorker=performance.now()-t1;
    calcul.arreter();
    const rendues=JSON.stringify(avant)===JSON.stringify(bands.map(b=>b.tiles.map(t=>t&&t.length)))&&bands.every(b=>b.tiles.every(t=>!t||t.length===b.ts*b.ts*4));
    let egal=pm.length===ref.length&&!!pm.raw&&pm.raw.length===ref.raw.length, maxPm=-90;
    for(let i=0;egal&&i<ref.length;i++){ for(let k=0;k<ref[i].length;k++){ if(!Object.is(pm[i][k],ref[i][k])){ egal=false; break; } if(ref[i][k]>maxPm) maxPm=ref[i][k]; }
      for(let k=0;egal&&k<ref.raw[i].length;k++) if(!Object.is(pm.raw[i][k],ref.raw[i][k])) egal=false; }
    return {egal,rendues,maxPm,msPrincipal:Math.round(msPrincipal),msWorker:Math.round(msWorker)};
  });
  console.log('masque : principal',r.msPrincipal,'ms · Worker',r.msWorker,'ms');
  expect(r.egal).toBe(true);
  expect(r.rendues).toBe(true); // les tuiles transférées au Worker sont revenues intactes
  expect(r.maxPm).toBeGreaterThan(0);
  expect(erreurs).toEqual([]);
});
