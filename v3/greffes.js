// Registre des greffes de la v3 (docs/REFONTE-V3.md §3) : un interrupteur par greffe, ÉTEINT par défaut, panneau « Greffes v2 » des Réglages,
// pierres tombales (compteurs de passage du code suspect, §6). Chargé avant le script principal de v3/villes-horizon.html ; ne dépend de rien.
// Une greffe = v3/greffes/<id>.js (module ES, `export default {init(ctx), ...}`), chargé SEULEMENT si son interrupteur est allumé.
// Réglage : panneau des Réglages (mémorisé sous la clé `vh3_greffes`) ou adresse de la page : ?g=lune,permutation (« tout », « aucune »), qui prime sans rien mémoriser.
(function(){
  'use strict';
  const VERSION='2026-11-17 (a) · gestes du mode photo en direct (Caler / Se déplacer, rotation) · 2026-11-16 (h) · R5 : « Se déplacer » en pleine largeur, doigt fantôme corrigé (champ 20°), traits de rappel ≥ 140 px · 2026-11-16 (g) : mode « Se déplacer » (ex-Explorer), grossir refait les noms · R5 : greffe photo · R4 : greffe placement · R3 : greffe toucher · R2 : greffe calques · R1 : greffe visibilite · R0 : planche de rendus et contrôles « ce que l’on voit » · v3 = v1 (j) + greffes activables (premier lot, + tailleReelle, plaque, capteurRelatif, recalageContinu, montagne, champAuto, nettete, nommer, projection, degage, hauteurs, oeilLieu, horizonPhoto, champPhoto, soleilReflet)';
  // etat : 'non testé' | 'validé' | 'rejeté' (seul Romain le change sur le terrain : docs/ETAT.md)
  const LISTE=[
    {id:'soleil2',type:'remplacement',etat:'non testé',titre:'Soleil (v2)',phrase:'Toucher le soleil : le disque vu dans l’image est retrouvé, même téléphone penché ou boussole fausse de plus de 12°.'},
    {id:'lune',type:'ajout',etat:'non testé',titre:'Lune',phrase:'De nuit, « Caler auto » et le toucher calent sur la lune (position avec parallaxe, tache ronde et brillante).'},
    {id:'permutation',type:'ajout',etat:'non testé',titre:'Repères : test contre le hasard',phrase:'« Caler auto » refuse les concordances fortuites de repères (Turin : ville dense, scènes au hasard acceptées à 100 % sans le test, ~7 % avec).'},
    {id:'echelle2',type:'ajout',etat:'non testé',titre:'Échelle sur 2 points',phrase:'Deux touchers (soleil ou lune + un monument, ou deux repères) donnent le cap ET le champ de la caméra.'},
    {id:'oeil',type:'ajout',etat:'non testé',titre:'Puce œil',phrase:'Puce « œil » près du rayon : détail du sol au toucher, « Réestimer », étage, altitude GPS en simple proposition.'},
    {id:'icones',type:'remplacement',etat:'non testé',titre:'Libellés sous les icônes',phrase:'Un mot sous chaque bouton de la colonne de droite ; les aides « ? » de la v1 restent toutes.'},
    {id:'rotation',type:'ajout',etat:'non testé',titre:'Message de rotation',phrase:'« Téléphone en paysage, écran en portrait : activez la rotation automatique ».'},
    {id:'lieuxWikidata',type:'ajout',etat:'non testé',titre:'Lieux : repli Wikidata',phrase:'Quand OpenStreetMap (Overpass) échoue, les villes et villages viennent aussi de Wikidata.'},
    {id:'boussoleA',type:'remplacement',etat:'non testé',titre:'Boussole : ne défait plus un calage',phrase:'Retour à la boussole seulement sur un vrai saut du gyroscope ; un désaccord sans saut = boussole perturbée, ignorée (à comparer à la v1).'},
    {id:'tailleReelle',type:'ajout',etat:'non testé',titre:'Monuments à taille réelle',phrase:'Plus de plafond de taille : la silhouette d’un monument proche garde sa taille réelle quelle que soit l’inclinaison ; si son sommet sort de l’écran, son nom reste au bord haut.'},
    {id:'plaque',type:'ajout',etat:'non testé',titre:'Lire une plaque de rue',phrase:'Bouton en tête des Réglages : la plaque filmée est lue, l’adresse trouvée (Base Adresse Nationale) corrige la position après confirmation ; elle suit ensuite vos pas.'},
    {id:'capteurRelatif',type:'remplacement',etat:'non testé',titre:'Anti-dérive : capteur relatif 60 Hz',phrase:'Le capteur d’orientation relatif (quaternion, 60 Hz) remplace le gyroscope de deviceorientation : suivi plus stable, la boussole ne sert que de nord.'},
    {id:'recalageContinu',type:'ajout',etat:'non testé',titre:'Anti-dérive : recalage continu',phrase:'Soleil ou lune dans l’image : le cap se corrige seul par petits pas (deux détections concordantes, téléphone stable, au plus ±20°).'},
    {id:'montagne',type:'ajout',etat:'non testé',titre:'Montagne : noms des sommets',phrase:'Tous les sommets nommés d’OpenStreetMap à moins de 120 km, les plus dominants (au plus 300), affichés seulement s’ils se voient d’ici (relief).'},
    {id:'champAuto',type:'ajout',etat:'non testé',titre:'Champ de la caméra mesuré',phrase:'Le champ (zoom) est mesuré tout seul quand vous tournez, dehors, par temps clair, face à un paysage lointain : gyroscope comparé au déplacement de l’image. Une puce « champ » montre l’avancement. Une fois mesuré, le pincement ne le change plus.'},
    {id:'nettete',type:'ajout',etat:'non testé',titre:'Mise au point à l’infini',phrase:'La mise au point de la caméra est fixée au plus loin : plus de flou sur le paysage après avoir visé le soleil.'},
    {id:'projection',type:'remplacement',etat:'non testé',titre:'Projection exacte (montagne)',phrase:'Le relief et les noms sont placés comme une vraie caméra les voit : en montagne, ils ne s’écartent plus de l’image vers les bords de l’écran (environ 1° d’écart dans la v1).'},
    {id:'degage',type:'ajout',etat:'non testé',titre:'Écran dégagé',phrase:'Le bouton ÉCRAN masque aussi les puces, les boutons et la barre du bas : plus de place pour les noms (bouton ⤡ en haut à droite pour tout retrouver). En photo, le bandeau est replié en une petite puce.'},
    {id:'hauteurs',type:'remplacement',etat:'non testé',titre:'Hauteurs des monuments',phrase:'Une tour ne donne sa hauteur qu’au monument compatible le plus proche (plus de statue à 40 m), et une statue reçoit la hauteur de sa fiche OpenStreetMap.'},
    {id:'oeilLieu',type:'ajout',etat:'non testé',titre:'Hauteur d’œil du lieu',phrase:'La hauteur d’œil réglée à la main reste attachée au lieu où elle a été réglée : ailleurs elle revient à 0, de retour elle est reprise. Sur une photo, elle est déduite de l’altitude enregistrée dans la photo (au sol, ou en hauteur à partir de 10 m d’écart).'},
    {id:'horizonPhoto',type:'ajout',etat:'non testé',titre:'Horizon de la photo',phrase:'Sur une photo de ville, l’horizon est réglé tout seul d’après les arêtes verticales des bâtiments (elles convergent quand l’appareil est levé ou baissé). Sans bâtiments, rien ne change : « Caler auto » règle l’horizon sur le relief.'},
    {id:'champPhoto',type:'ajout',etat:'non testé',titre:'Champ réel des photos',phrase:'Le champ écrit dans une photo est une valeur nominale (Pixel 9 : 71,5° écrits, 63,5° mesurés). Quand « Caler auto » réussit sur le relief d’une photo, le champ réel de l’appareil est retenu et repris pour ses photos suivantes.'},
    {id:'soleilReflet',type:'remplacement',etat:'non testé',titre:'Soleil sous les nuages',phrase:'« Caler » sur le soleil : une tache claire n’est prise pour un reflet que si elle est sous l’horizon, et le plus gros disque est préféré aux petits éclats de nuage (à Morgat, le vrai soleil était écarté comme « reflet » et l’horizon faussé de 4 à 5°).'},
    {id:'etiquettes',type:'ajout',etat:'non testé',titre:'Noms : de la place, de la tenue',phrase:'Un nom de lieu qui ne tient pas incliné s’écrit à plat à côté du point (au-dessus, sinon dessous) ; un nom affiché reste 2 s même sans place ; sommets et cols en vert.'},
    {id:'toits',type:'ajout',etat:'non testé',titre:'Villages : toits comptés',phrase:'Un lieu habité n’est plus jugé caché par le relief pour une crête devant lui de moins de 0,5° au-dessus de ses toits (Choranche, vu de Pont-en-Royans).'},
    {id:'lieuxRapides',type:'ajout',etat:'non testé',titre:'Lieux : publiés dès la première réponse',phrase:'Les lieux s’affichent dès qu’une source répond (OpenFreeMap : 1 s) au lieu d’attendre la plus lente ; Overpass n’est attendu que 8 s, puis relancé quand il répond.'},
    {id:'gpsRapide',type:'ajout',etat:'non testé',titre:'GPS : démarrage rapide',phrase:'Au démarrage, la dernière position connue du système (jusqu’à 10 min) est acceptée tout de suite et marquée « ancienne » ; elle est remplacée par le premier vrai point. Une puce signale un GPS qui tarde (relief peut-être celui du lieu précédent).'},
    {id:'anfrRelief',type:'ajout',etat:'non testé',titre:'Pylônes ANFR sur le relief',phrase:'Les pylônes ANFR sont posés à leur sommet sur le relief (plus sur la ligne d’horizon) ; un pylône relié à un mât d’OpenStreetMap (moins de 80 m, hauteurs d’accord) n’est dessiné qu’une fois, au mât.'},
    {id:'presDe',type:'ajout',etat:'non testé',titre:'« Près de… » en direct',phrase:'Une puce « Près de <lieu habité visible le plus proche> », comme la légende de la capture, mise à jour pendant que vous marchez.'},
    {id:'zones',type:'ajout',etat:'non testé',titre:'Noms de zones',phrase:'Gorges, crêtes, massifs, forêts, grottes, vallées déjà chargés par Wikidata (écartés jusqu’ici des monuments) sont écrits comme les sommets, sans être masqués par le relief.'},
    {id:'visibilite',type:'remplacement',etat:'non testé',titre:'N’afficher que ce qui se voit',phrase:'Le relief est toujours appliqué aux noms (plus de noms posés sur l’horizon) ; une seule case affine avec la photo, seulement sur un calage sûr ; les zones ponctuelles (cols, grottes) sont testées comme un point.'},
    {id:'calques',type:'remplacement',etat:'non testé',titre:'Un calque par nature',phrase:'Calques « Lieux » (habités), « Montagne » (sommets, cols, crêtes, zones, grottes) et « Mer » (phares, plages) ; une grotte, un rocher, un cap vont au calque de leur milieu (bord de l’eau, relief marqué).'},
    {id:'toucher',type:'ajout',etat:'non testé',titre:'Tout nom se touche',phrase:'Toucher un nom de lieu, de sommet ou de zone ouvre sa fiche (nature, altitude, distance, direction, source, carte) ; la puce « Près de » aussi ; « Relief touché » ne répond que hors des noms.'},
    {id:'placement',type:'remplacement',etat:'non testé',titre:'Étiquettes : sans recouvrement, rapides',phrase:'Jamais deux noms l’un sur l’autre, rien sous les boutons, traits de rappel courts (un quart de l’écran) ; altitude et distance en vert pour la montagne ; placement plus rapide en « Tout voir ».'},
    {id:'photo',type:'remplacement',etat:'non testé',titre:'Mode photo : photo entière, Caler / Se déplacer (pleine largeur)',phrase:'La photo s’ouvre entière et calée toute seule (puce « annuler ») ; bouton Caler / Se déplacer (se déplacer dans la photo, grossir : les noms sont refaits à l’échelle) ; rotation à deux doigts ; le calage de chaque photo est retenu. En direct, le bouton verrouille le calage.'},
    {id:'nommer',type:'ajout',etat:'non testé',titre:'Nommer le relief touché',phrase:'Toucher une montagne, une crête ou un plateau : son nom (sommet, col, lieu-dit… d’OpenStreetMap), sa distance et son altitude ; une épingle reste une minute.'},
  ];
  const IDS=LISTE.map(g=>g.id), CLE='vh3_greffes', CLE_TOMBES='vh3_tombes';
  const lire=k=>{ try{ return JSON.parse(localStorage.getItem(k)||'null'); }catch(e){ return null; } };
  const ecrire=(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} };
  // interrupteurs : ?g=… (prime, non mémorisé), sinon la mémoire de l'appareil
  const param=(()=>{ try{ return new URLSearchParams(location.search).get('g'); }catch(e){ return null; } })();
  const parAdresse=param!==null;
  let allumees;
  if(parAdresse){ const v=param.split(/[,; ]+/).map(s=>s.trim()).filter(Boolean);
    allumees=v.includes('tout')?IDS.slice():IDS.filter(id=>v.includes(id)); }
  else { const m=lire(CLE); allumees=IDS.filter(id=>m&&m[id]===true); }
  const mods={}, inits={}; let ctx=null;
  const base=(document.currentScript&&document.currentScript.src)||location.href;
  const chargements=allumees.map(id=>import(new URL('greffes/'+id+'.js',base).href).then(m=>{ mods[id]=m.default; G[id]=m.default; demarrer(id); })
    .catch(e=>{ G.erreurs.push(id+' : '+(e&&e.message||e)); console.error('greffe '+id,e); }));
  function demarrer(id){ if(!ctx||!mods[id]||inits[id]) return; try{ if(mods[id].init) mods[id].init(ctx); inits[id]=true; }catch(e){ G.erreurs.push(id+' : '+(e&&e.message||e)); console.error('greffe '+id,e); } }

  // ---- pierres tombales (§6) : passages comptés en mémoire, écrits toutes les 15 s et en quittant la page ----
  const tombes=lire(CLE_TOMBES)||{}; let sale=false;
  const ecrireTombes=()=>{ if(sale){ sale=false; ecrire(CLE_TOMBES,tombes); } };
  setInterval(ecrireTombes,15000); addEventListener('pagehide',ecrireTombes); document.addEventListener('visibilitychange',()=>{ if(document.hidden) ecrireTombes(); });
  // ---- journal du contexte (lot 11) : pour l'export de debug (debug/debug-cache.html › contexte) ----
  // À chaque démarrage et à chaque changement d'interrupteur : date, version, greffes allumées, réglages utiles. Les lignes du journal réseau y sont ajoutées
  // toutes les 15 s (200 au plus). Borné ; aucune donnée d'un calque personnel (seuls les interrupteurs des calques sont gardés).
  const CLE_JOURNAL='vh3_journal', MAX_LIGNES=60, MAX_RESEAU=200;
  const journal=(()=>{ const j=lire(CLE_JOURNAL); return j&&Array.isArray(j.lignes)?{lignes:j.lignes,reseau:Array.isArray(j.reseau)?j.reseau:[]}:{lignes:[],reseau:[]}; })();
  let dernierReseau=0;
  function reglagesUtiles(){
    const S=ctx&&ctx.S; if(!S) return null;
    const L=S.layers||{}, P=S.poi||{};
    return {radius:S.radius,hamlets:S.hamlets,photoVis:S.photoVis,relief:S.relief,beyond:S.beyond,obsHeight:S.obsHeight,camFov:S.camFov,headOff:S.headOff,pitchOff:S.pitchOff,
      telecom:S.telecom,buildings:S.buildings,calques:Object.fromEntries(Object.entries(L).filter(([,v])=>typeof v==='boolean')),reperes:Object.fromEntries(Object.entries(P).filter(([,v])=>typeof v==='boolean'))};
  }
  function noterContexte(type,greffes){
    journal.lignes.push({t:new Date().toISOString(),type,page:VERSION,greffes:greffes||allumees.slice(),reglages:reglagesUtiles(),
      ecran:(typeof innerWidth==='number'?innerWidth+'x'+innerHeight:null),statut:(document.getElementById('status')||{}).textContent||''});
    if(journal.lignes.length>MAX_LIGNES) journal.lignes.splice(0,journal.lignes.length-MAX_LIGNES);
    ecrire(CLE_JOURNAL,journal);
  }
  function noterReseau(){
    const nl=ctx&&ctx.netLog; if(!nl||!nl.length) return;
    const neuves=nl.filter(e=>e.t>dernierReseau).reverse(); if(!neuves.length) return;
    dernierReseau=Math.max(...neuves.map(e=>e.t));
    for(const e of neuves) journal.reseau.push({t:new Date(e.t).toISOString(),kind:e.kind,ok:e.ok,detail:String(e.detail||'').slice(0,300)});
    if(journal.reseau.length>MAX_RESEAU) journal.reseau.splice(0,journal.reseau.length-MAX_RESEAU);
    ecrire(CLE_JOURNAL,journal);
  }
  setInterval(noterReseau,15000); addEventListener('pagehide',noterReseau);
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  const G={
    VERSION, liste:LISTE, erreurs:[],
    /** La greffe est allumée, chargée et démarrée. */
    actif:id=>!!inits[id],
    /** Interrupteur allumé (chargée ou non). */
    allumee:id=>allumees.includes(id),
    allumees:()=>allumees.slice(),
    /** Promesse : toutes les greffes allumées sont chargées et démarrées (tests). */
    pret:()=>Promise.all(chargements).then(()=>allumees.filter(id=>inits[id])),
    /** Le script principal donne accès à ses variables (getters) : appelé une fois, à la fin de son initialisation. */
    lier(c){ ctx=c; for(const id of allumees) demarrer(id); noterContexte('demarrage'); },
    /** Pierre tombale : un passage dans un bloc suspect. */
    tombe(id){ const t=tombes[id]||(tombes[id]={n:0,t:0}); t.n++; t.t=Date.now(); sale=true; },
    tombes:()=>JSON.parse(JSON.stringify(tombes)),
    /** Journal du contexte (lignes de démarrage et d'interrupteur, lignes du journal réseau). */
    journal:()=>JSON.parse(JSON.stringify(journal)),
    /** Interrupteurs mémorisés (panneau) ; recharge la page pour les appliquer. */
    choisir(id,on){ const m=lire(CLE)||{}; m[id]=!!on; ecrire(CLE,m); noterReseau(); noterContexte('interrupteur : '+id+(on?' allumé':' éteint'),IDS.filter(g=>m[g]===true));
      const u=new URL(location.href); u.searchParams.delete('g'); location.replace(u.href); },
    /** Section du Diagnostic : greffes allumées, erreurs de chargement, pierres tombales. */
    diagnosticHtml(){
      const on=allumees.map(id=>id+(inits[id]?'':' (non chargée)'));
      const t=Object.entries(tombes).sort((a,b)=>a[1].n-b[1].n||a[0].localeCompare(b[0]));
      const d=v=>v?new Date(v).toLocaleString('fr-FR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
      return `<div class="dbgsec">Greffes v2 (v3)</div><div class="dbgline">${esc(VERSION)}</div>`
        +`<div class="dbgline">allumées : ${on.length?esc(on.join(', ')):'aucune (v3 = v1)'}${parAdresse?' · choisies par l’adresse (?g=)':''}</div>`
        // ancrage des noms : sans « Masquer ce qui est caché par le relief », la v1 pose tous les noms sur la ligne d'horizon et ne charge aucun sommet lointain
        +(ctx&&ctx.S?`<div class="dbgline"${ctx.S.relief?'':' style="color:#E08787"'}>ancrage des noms : ${ctx.S.relief?(ctx.terrain?'sur le relief (masquage actif)':'relief en attente : noms sur la ligne d’horizon pour l’instant'):'« Masquer ce qui est caché par le relief » est DÉCOCHÉ (Réglages) : tous les noms sont posés sur la ligne d’horizon pointillée, rien n’est masqué, aucun sommet lointain n’est chargé'}</div>`:'')
        +allumees.filter(id=>inits[id]&&mods[id].statut).map(id=>{ let t; try{ t=mods[id].statut(); }catch(e){ t=id+' : '+e.message; } return (Array.isArray(t)?t:[t]).map(l=>`<div class="dbgline">${esc(l)}</div>`).join(''); }).join('')
        +(G.erreurs.length?`<div class="dbgline" style="color:#E08787">${esc(G.erreurs.join(' · '))}</div>`:'')
        +`<div class="dbgsec">Pierres tombales (code suspect, ${t.length} bloc(s) passé(s) au moins une fois)</div>`
        +`<div class="dbgline">${t.map(([id,v])=>`${esc(id)} : <b>${v.n}</b> (dernier ${d(v.t)})`).join('<br>')||'aucun passage enregistré'}</div>`;
    },
    /** Panneau « Greffes v2 » ajouté à la fin des Réglages. */
    monterPanneau(sheet){
      if(!sheet||document.getElementById('g3Panel')) return;
      const det=document.createElement('details'); det.className='grp'; det.id='g3Panel'; det.dataset.grp='g3';
      det.innerHTML=`<summary><b>Greffes v2</b><i class="gsum">${allumees.length?allumees.length+' allumée(s)':'toutes éteintes'}</i></summary>`
        +LISTE.map(g=>`<div class="row"><label for="g3_${g.id}">${esc(g.titre)}<em>${esc(g.type)} · ${esc(g.etat)}</em></label><input type="checkbox" id="g3_${g.id}" data-g="${g.id}"${allumees.includes(g.id)?' checked':''}><span class="hint">${esc(g.phrase)}</span></div>`).join('')
        +`<div class="row"><span class="hint">Une greffe éteinte = le code de la v1, inchangé. Changer un interrupteur recharge la page. Par l’adresse : <b>?g=lune,permutation</b> (ou <b>?g=tout</b>).${parAdresse?' Choix actuel donné par l’adresse.':''} ${esc(VERSION)}</span></div>`;
      det.addEventListener('change',e=>{ const id=e.target&&e.target.dataset&&e.target.dataset.g; if(id) G.choisir(id,e.target.checked); });
      sheet.appendChild(det);
    },
  };
  window.G=G;
})();
