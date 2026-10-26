// Rejeu d'un export du cache (Réglages > Exporter le cache) : les entrees sont remises dans la Cache API de la page, sous les memes
// noms, cles et entetes que sur le telephone ; le vrai code de l'appli (fetchTileBitmap, dcFetch...) les relit sans rien simuler.
// A appeler APRES le chargement de la page et AVANT « Ouvrir la camera » / l'ouverture d'une photo.
const fs=require('fs');
const NAMES={t:'vh-terrain-v1',dc:'vh-data-v1'}, DC_BASE='https://vh.cache/';

function readDump(file){
  const d=JSON.parse(fs.readFileSync(file,'utf8'));
  if(d.format!=='vh-cache-1') throw new Error(`${file} : format inconnu (${d.format})`);
  return d;
}
async function seedCaches(page,dump,{batch=40}={}){
  for(let i=0;i<dump.entries.length;i+=batch){
    await page.evaluate(async({entries,NAMES,DC_BASE})=>{
      const now=Date.now(); // entrees fraiches : l'horloge des tests est figee, la date d'origine les ferait perimer
      for(const e of entries){
        const body=e.enc==='text'?e.d:Uint8Array.from(atob(e.d),ch=>ch.charCodeAt(0));
        const c=await caches.open(NAMES[e.c]);
        await c.put(e.c==='dc'?DC_BASE+e.k:e.k,new Response(body,{headers:{'x-t':String(now),'content-type':e.type||'application/octet-stream'}}));
      }
    },{entries:dump.entries.slice(i,i+batch),NAMES,DC_BASE});
  }
  return dump.entries.length;
}
module.exports={readDump,seedCaches,NAMES};
