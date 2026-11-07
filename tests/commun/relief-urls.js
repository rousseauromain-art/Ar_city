// URL des tuiles de relief utiles en un point (memes bandes que computeTerrain de la v1 et que debug/debug-cache.html) :
// Mapterhorn et, pour chacune, son secours AWS (mosaique de 4 tuiles de z+1) ; puis les bandes AWS historiques.
const D=Math.PI/180;
const BANDS_HR=[{z:13,max:5,ts:512},{z:12,max:30,ts:512},{z:11,max:60,ts:512},{z:8,max:200,ts:512}];
const BANDS_LEGACY=[{z:11,max:12,ts:256},{z:10,max:30,ts:256},{z:9,max:60,ts:256},{z:8,max:200,ts:256}];
const URL_HR=(z,x,y)=>`https://tiles.mapterhorn.com/${z}/${x}/${y}.webp`;
const URL_AWS=(z,x,y)=>`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
function pix(z,lat,lon,ts){ const n=ts*Math.pow(2,z), s=Math.sin(lat*D); return [(lon+180)/360*n,(0.5-Math.log((1+s)/(1-s))/(4*Math.PI))*n]; }
function tilesOfBand(b,c){
  const dLat=b.max/111.32, dLon=b.max/(111.32*Math.max(0.2,Math.cos(c.lat*D)));
  const [x0,y0]=pix(b.z,c.lat+dLat,c.lon-dLon,b.ts), [x1,y1]=pix(b.z,c.lat-dLat,c.lon+dLon,b.ts), out=[];
  for(let y=Math.floor(y0/b.ts);y<=Math.floor(y1/b.ts);y++) for(let x=Math.floor(x0/b.ts);x<=Math.floor(x1/b.ts);x++) out.push([b.z,x,y]);
  return out;
}
/** @returns {{hr:string[], tout:Set<string>}} hr : tuiles Mapterhorn de la v1 ; tout : toutes les URL possibles (secours compris) */
function reliefUrls(c){
  const hr=[], tout=new Set();
  for(const b of BANDS_HR) for(const [z,x,y] of tilesOfBand(b,c)){ hr.push(URL_HR(z,x,y)); tout.add(URL_HR(z,x,y)); for(let dy=0;dy<2;dy++) for(let dx=0;dx<2;dx++) tout.add(URL_AWS(z+1,2*x+dx,2*y+dy)); }
  for(const b of BANDS_LEGACY) for(const [z,x,y] of tilesOfBand(b,c)) tout.add(URL_AWS(z,x,y));
  return {hr,tout};
}
module.exports={reliefUrls};
