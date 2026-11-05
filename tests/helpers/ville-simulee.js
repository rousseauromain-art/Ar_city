// Ville simulée pour les tests e2e : tuiles vectorielles de bâtiments (IGN, z15) et de rues (OpenFreeMap, z14) fabriquées à la volée, TileJSON d'OpenFreeMap, relais /bdtopo.
// Aucune logique de l'application : seulement l'encodage protobuf des tuiles et les routes Playwright. Les bâtiments sont donnés en mètres (nord, est) depuis une position.
const varint=n=>{ const o=[]; while(n>=128){ o.push((n&127)|128); n=Math.floor(n/128); } o.push(n); return o; };
const champ=(num,type,b)=>[...varint((num<<3)|type),...b];
const chaine=(num,s)=>{ const b=[...Buffer.from(s,'utf8')]; return champ(num,2,[...varint(b.length),...b]); };
const zig=n=>(n<<1)^(n>>31);
const empile=(num,nb)=>{ const b=nb.flatMap(varint); return champ(num,2,[...varint(b.length),...b]); };
const cmd=(id,count)=>(count<<3)|id;

function couche(nom,features,extent=4096){
  const keys=[],values=[], idx=(l,v)=>{ let i=l.indexOf(v); if(i<0){ i=l.length; l.push(v); } return i; };
  const feats=features.map(f=>{
    const tags=Object.entries(f.tags||{}).flatMap(([k,v])=>[idx(keys,k),idx(values,String(v))]); const geom=[]; let cx=0,cy=0;
    for(const t of f.traces){ geom.push(cmd(1,1),zig(t[0][0]-cx),zig(t[0][1]-cy)); cx=t[0][0]; cy=t[0][1]; geom.push(cmd(2,t.length-1));
      for(const p of t.slice(1)){ geom.push(zig(p[0]-cx),zig(p[1]-cy)); cx=p[0]; cy=p[1]; } if(f.type==='polygone') geom.push(cmd(7,1)); }
    const b=[...empile(2,tags),...champ(3,0,varint(f.type==='polygone'?3:2)),...empile(4,geom)]; return champ(2,2,[...varint(b.length),...b]); });
  const corps=[...chaine(1,nom),...feats.flat(),...keys.flatMap(k=>chaine(3,k)),...values.flatMap(v=>{ const b=chaine(1,v); return champ(4,2,[...varint(b.length),...b]); }),...champ(5,0,varint(extent))];
  return champ(3,2,[...varint(corps.length),...corps]);
}
const tuile=(...c)=>Buffer.from(c.flat());

/** Longitude et latitude d'un point à (nord, est) mètres de `pos`. */
const decaler=(pos,N,E)=>({ lat:pos.lat+N/111320, lon:pos.lon+E/(111320*Math.cos(pos.lat*Math.PI/180)) });
/** Tuile (z, x, y) et coordonnées locales (0..4096) d'un point. */
function local(lat,lon,z){ const n=2**z, fx=(lon+180)/360*n, fy=(1-Math.log(Math.tan(lat*Math.PI/180)+1/Math.cos(lat*Math.PI/180))/Math.PI)/2*n, x=Math.floor(fx), y=Math.floor(fy); return {x,y,lx:Math.round((fx-x)*4096),ly:Math.round((fy-y)*4096)}; }
/** Coordonnées d'un point dans une tuile donnée (peut sortir de 0..4096 : la marge d'une tuile). */
const dansTuile=(lat,lon,z,tx,ty)=>{ const n=2**z, fx=(lon+180)/360*n, fy=(1-Math.log(Math.tan(lat*Math.PI/180)+1/Math.cos(lat*Math.PI/180))/Math.PI)/2*n; return [Math.round((fx-tx)*4096),Math.round((fy-ty)*4096)]; };

/**
 * @param {import('@playwright/test').Page} page
 * @param {{pos:{lat:number,lon:number}, batiments?:{N:number,E:number,w:number,l:number,h:number,etages?:number}[], rues?:{nom:string,classe?:string,points:[number,number][]}[], ign?:'ok'|'refuse', relais?:boolean}} o
 *   batiments : rectangles (centre nord/est en m, demi-largeur w, demi-profondeur l, hauteur h) ; rues : polylignes en (nord, est) m.
 */
async function installerVille(page,{pos,batiments=[],rues=[],ign='ok',relais=true}){
  const compte={ign:0,relais:0,rues:0,tilejson:0};
  const tuileBat=(z,tx,ty)=>tuile(couche('batiment',batiments.map(b=>{ const c=[[-b.l,-b.w],[-b.l,b.w],[b.l,b.w],[b.l,-b.w]].map(([dn,de])=>{ const p=decaler(pos,b.N+dn,b.E+de); return dansTuile(p.lat,p.lon,z,tx,ty); });
    return { type:'polygone', tags:b.etages?{nombre_d_etages:b.etages}:{hauteur:b.h}, traces:[c] }; })));
  const tuileRues=(z,tx,ty)=>tuile(couche('transportation',rues.map(r=>({ type:'ligne', tags:{class:r.classe||'minor'}, traces:[r.points.map(([N,E])=>{ const p=decaler(pos,N,E); return dansTuile(p.lat,p.lon,z,tx,ty); })] }))),
    couche('transportation_name',rues.map(r=>({ type:'ligne', tags:{class:r.classe||'minor',name:r.nom}, traces:[r.points.map(([N,E])=>{ const p=decaler(pos,N,E); return dansTuile(p.lat,p.lon,z,tx,ty); })] }))));
  await page.route(/data\.geopf\.fr\/tms\/1\.0\.0\/BDTOPO\/(\d+)\/(\d+)\/(\d+)\.pbf/,async r=>{ compte.ign++; if(ign==='refuse'){ await r.abort(); return; } const m=r.request().url().match(/BDTOPO\/(\d+)\/(\d+)\/(\d+)/); await r.fulfill({status:200,contentType:'application/x-protobuf',headers:{'access-control-allow-origin':'*'},body:tuileBat(+m[1],+m[2],+m[3])}); });
  await page.route(/\/bdtopo\?z=(\d+)&x=(\d+)&y=(\d+)/,async r=>{ compte.relais++; if(!relais){ await r.fulfill({status:502,body:''}); return; } const m=r.request().url().match(/z=(\d+)&x=(\d+)&y=(\d+)/); await r.fulfill({status:200,contentType:'application/x-protobuf',headers:{'access-control-allow-origin':'*'},body:tuileBat(+m[1],+m[2],+m[3])}); });
  await page.route(/tiles\.openfreemap\.org\/planet$/,async r=>{ compte.tilejson++; await r.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({tiles:['https://tiles.openfreemap.org/planet/20260101/{z}/{x}/{y}.pbf']})}); });
  await page.route(/tiles\.openfreemap\.org\/planet\/20260101\/(\d+)\/(\d+)\/(\d+)\.pbf/,async r=>{ compte.rues++; const m=r.request().url().match(/(\d+)\/(\d+)\/(\d+)\.pbf/); await r.fulfill({status:200,contentType:'application/x-protobuf',headers:{'access-control-allow-origin':'*'},body:z14(+m[1],+m[2],+m[3])}); });
  const z14=(z,x,y)=>z===14?tuileRues(z,x,y):tuile(couche('place',[]));
  return compte;
}
module.exports={installerVille,decaler,local,couche,tuile};
