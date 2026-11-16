// `npm run planche` : lance la planche de rendus (plan du 16/11, lot R0) puis assemble son README.
// Usage : PLANCHE_PR=107 [PLANCHE_AVANT=contexte] [PLANCHE_APRES=contexte,visibilite] npm run planche
// Sortie : $PHOTOS_DIR/rendus/PR-<numéro>/ (dépôt privé Ar_city-photos — jamais dans Ar_city).
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {assemblerReadme}=require('./planche.js');

const PHOTOS_DIR=process.env.PHOTOS_DIR||'/home/user/ar_city-photos';
if(!fs.existsSync(PHOTOS_DIR)){ console.error(`Dépôt privé introuvable (PHOTOS_DIR=${PHOTOS_DIR}) : la planche a besoin des photos.`); process.exit(1); }
const pr=process.env.PLANCHE_PR||'brouillon';
const dir=path.join(PHOTOS_DIR,'rendus',`PR-${pr}`);
fs.mkdirSync(dir,{recursive:true});

const avant=process.env.PLANCHE_AVANT||'', apres=process.env.PLANCHE_APRES||'contexte';
const r=spawnSync('npx',['playwright','test','--project=v3','v3/tests/planche.spec.js','--trace','off','--workers=2'],
  {stdio:'inherit',env:{...process.env,PLANCHE:'1',PLANCHE_DIR:dir,PLANCHE_AVANT:avant,PLANCHE_APRES:apres}});
if(r.status!==0) process.exit(r.status||1);

const titre=`PR-${pr}`;
const description=`Avant : ${avant||'toutes greffes éteintes (v1)'}. Après : ${apres}. Scènes du banc rejouées sur les photos et le cache du téléphone (réglages du 15/11, « Visibilité d'après la photo » cochée).`;
assemblerReadme(dir,{titre,description});
console.log(`\nPlanche écrite dans ${dir}`);
