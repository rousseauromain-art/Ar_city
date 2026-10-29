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
// export en plusieurs paquets (..._p1sur3.json) : tous les fichiers du meme export, fusionnes en un seul rejeu
function readDumps(files){
  const ds=files.map(readDump), n=ds[0].parts||1;
  if(ds.length!==n||new Set(ds.map(d=>d.at)).size!==1) throw new Error(`export incomplet ou melange : ${ds.length} fichier(s) pour ${n} paquet(s) attendu(s)`);
  return {...ds[0],entries:ds.flatMap(d=>d.entries)};
}
async function seedCaches(page,dump,{batch=40,noms=NAMES}={}){
  for(let i=0;i<dump.entries.length;i+=batch){
    await page.evaluate(async({entries,NAMES,DC_BASE})=>{
      const now=Date.now(); // entrees fraiches : l'horloge des tests est figee, la date d'origine les ferait perimer
      for(const e of entries){
        const body=e.enc==='text'?e.d:Uint8Array.from(atob(e.d),ch=>ch.charCodeAt(0));
        const c=await caches.open(NAMES[e.c]);
        await c.put(e.c==='dc'?DC_BASE+e.k:e.k,new Response(body,{headers:{'x-t':String(now),'content-type':e.type||'application/octet-stream'}}));
      }
    },{entries:dump.entries.slice(i,i+batch),NAMES:noms,DC_BASE});
  }
  return dump.entries.length;
}
// dossier ou liste de fichiers contenant un ou plusieurs exports (paquets regroupes par date d'export) : toutes les entrees, sans doublon de cle
function readExports(files){
  const by=new Map(); for(const f of files){ const d=readDump(f); (by.get(d.at)||by.set(d.at,[]).get(d.at)).push(d); }
  const seen=new Map(), metas=[];
  for(const [at,ds] of by){ if(ds.length!==(ds[0].parts||1)) throw new Error(`export ${at} incomplet : ${ds.length} fichier(s) sur ${ds[0].parts}`);
    metas.push({at,pos:ds[0].pos,parts:ds.length}); for(const d of ds) for(const e of d.entries) seen.set(e.c+':'+e.k,e); }
  return {format:'vh-cache-1',exports:metas,entries:[...seen.values()]};
}
module.exports={readDump,readDumps,readExports,seedCaches,NAMES};
