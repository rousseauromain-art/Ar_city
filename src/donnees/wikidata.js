// @ts-check
/**
 * Tri des lieux Wikidata (08/10/2026). Le relais (/wdtile) renvoie TOUT lieu géolocalisé d'une tuile avec ses classes (P31, libellés fr/en) ;
 * c'est ici qu'on décide ce que c'est : monument (patrimoine bâti ou protégé « monument historique »), équipement (lieu de vie repérable sur
 * l'horizon : stade, gare, canal, parc, place, théâtre, pont, hôpital…) ou écarté (commune, quartier, événement, société, œuvre…).
 * Entrées : { types: « classe|classe », name, links, prot }. Sortie : { cat, type, minLinks?, why }. Fonctions pures, aucune dépendance.
 * Les expressions sont celles du bloc WDCLASS de la v1 (le même texte que debug/debug-trafic.html) : tests/unit/wikidata.test.mjs vérifie l'identité.
 */

/** Expression « mot entier », insensible à la casse, avec pluriel en s. @param {string} src */
const _W=(src)=>new RegExp("(?:^|[^a-zà-ÿ])(?:"+src+")s?(?![a-zà-ÿ])","i");
/** Monument typique : église, château, musée, tour… */
export const WD_MONS=_W("[ée]metteur|transmitter|pyl[ôo]ne|pylon|radio mast|antenna tower|antenne|[ée]glise|church|chapelle|chapel|cath[ée]drale|cathedral|basilique|basilica|abbaye|abbey|monast[èe]re|monastery|couvent|convent|prieur[ée]|priory|clo[îi]tre|cloister|temple|mosqu[ée]e|mosque|synagogue|pagode|sanctuaire|shrine|calvaire|croix|oratoire|baptist[èe]re|ch[âa]teau|castle|palais|palace|forteresse|fortress|citadelle|citadel|fort|manoir|manor|h[ôo]tel particulier|h[ôo]tel de ville|town hall|mairie|maison forte|maison natale|maison-musée|historic house|country house|villa|donjon|rempart|fortification|enceinte|porte de ville|city gate|tour|tower|beffroi|belfry|clocher|phare|lighthouse|moulin|windmill|watermill|mus[ée]e|museum|monument|m[ée]morial|memorial|statue|sculpture|fontaine|fountain|ob[ée]lisque|obelisk|colonne|column|arc de triomphe|triumphal arch|mausol[ée]e|mausoleum|panth[ée]on|pantheon|gratte-ciel|skyscraper|ruines?|ruins?|vestiges?|site arch[ée]ologique|archaeological site|m[ée]galithe|menhir|dolmen|tumulus|amphith[ée][âa]tre|amphitheat(?:er|re)|ar[èe]nes|th[ée][âa]tre antique|colombier|pigeonnier|lavoir|ch[âa]teau d['’]eau|water tower|place forte|hôtel-dieu|ensemble architectural|palais de justice historique");
/** Équipements, du plus spécifique au plus général : [expression, icône, nombre de langues minimum]. @type {[RegExp, string, number][]} */
export const WD_EQUIP=[
  [_W("stade|stadium|arena|aréna|hippodrome|v[ée]lodrome|circuit|palais des sports|salle omnisports|patinoire|ice rink|piscine|swimming pool|complexe sportif|sports? (?:complex|cent(?:er|re)|venue|facility)|gymnase|golf|skatepark|parc des expositions|parc d['’]attractions|amusement park|theme park"),'stade',1],
  [_W("station de (?:m[ée]tro|tramway|tram|bus|rer|train|chemin de fer)|m[ée]tro station|metro station|subway station|rapid transit station|railway station|train station|gare|tram(?:way)? stop|halte|terminus|pôle d['’][ée]changes|a[ée]roport|airport|a[ée]rodrome|h[ée]liport|heliport|port|harbou?r|marina|ferry terminal|bus station|funiculaire|t[ée]l[ée]ph[ée]rique|cable car"),'gare',1],
  [_W("canal|canaux|fleuve|rivi[èe]re|river|stream|ruisseau|lac|lake|[ée]tang|pond|cours d['’]eau|watercourse|waterway|voie navigable|bassin|basin|barrage|dam|[ée]cluse|lock|plan d['’]eau|r[ée]servoir|reservoir|chute d['’]eau|waterfall|cascade|plage|beach|baie|bay|estuaire|estuary|lagune|lagoon|marais|marsh|wetland"),'eau',1],
  [_W("place|plaza|public square|town square|square|piazza|platz|rue|street|avenue|boulevard|mail|carrefour|rond-point|roundabout|esplanade|promenade|parvis"),'place',1],
  [_W("parc|park|jardin|garden|bois|woodland|for[êe]t|forest|r[ée]serve naturelle|nature reserve|zoo|aquarium|arboretum|cimeti[èe]re|cemetery|coul[ée]e verte|espace vert|green space|pelouse|prairie|meadow|verger|orchard|vignoble|vineyard"),'parc',1],
  [_W("th[ée][âa]tre|theat(?:er|re)|op[ée]ra|cin[ée]ma|movie theat(?:er|re)|salle de (?:concert|spectacle|cin[ée]ma)|concert hall|auditorium|centre culturel|cultural cent(?:er|re)|maison de la culture|biblioth[èe]que|library|m[ée]diath[èe]que|salle des f[êe]tes|casino|cirque|circus|salle de musiques? actuelles?|music venue"),'scene',1],
  [_W("pont|bridge|viaduc|viaduct|passerelle|footbridge|aqueduc|aqueduct"),'pont',1],
  [_W("h[ôo]pital|hospital|clinique|clinic|centre hospitalier|universit[ée]|university|[ée]cole sup[ée]rieure|grande [ée]cole|facult[ée]|campus|lyc[ée]e|coll[èe]ge|[ée]cole|school|centre commercial|shopping (?:cent(?:er|re)|mall)|mall|march[ée]|market|halles?|h[ôo]tel|hotel|prison|jail|caserne|barracks|pr[ée]fecture|tribunal|palais de justice|courthouse|parlement|parliament|assembl[ée]e|minist[èe]re|ministry|bureau de poste|post office|centrale [ée]lectrique|power station|station d['’][ée]puration|raffinerie|refinery"),'edifice',5],
];
/** Écarté : commune, quartier, événement, société, œuvre… */
export const WD_EXCL=_W("communes?(?: nouvelle| déléguée| associée)?|ville|cit(?:y|é)|town|village|municipality|municipalité|human settlement|établissement humain|hameau|hamlet|localité|lieu-dit|quartier|neighbou?rhood|arrondissement|canton|d[ée]partement|r[ée]gion|province|pays|country|territoire|territory|[îi]le|island|[îi]lot|archipel|presqu['’][îi]le|péninsule|peninsula|cap|mont(?:agne)?|mountain|colline|hill|sommet|summit|vall[ée]e|valley|massif|district|circonscription|intercommunalité|communauté (?:de communes|d['’]agglomération|urbaine)|agglomération|métropole|aire urbaine|unité urbaine|bassin versant|watershed|zone d['’]activit[ée]|festival|[ée]v[ée]nement|event|salon|exposition|foire|compétition|championnat|tournoi|bataille|battle|course|race|[ée]preuve|rallye|rally|marathon|tour cycliste|attentat|accident|[ée]lection|guerre|war|club|[ée]quipe|team|entreprise|company|société|business|parti|syndicat|usine|factory|plant|manufacture|marque|brand|fonction|position|[œo]uvre|film|album|livre|book|roman|série|émission|chanson|song|personnage|character|esp[èe]ce|species|taxon|langue|language|religion|famille|family|dynastie|groupe|band|projet|project|programme|loi|law|trait[ée]|treaty|prix|award|ligne|line|route|road|itin[ée]raire|sentier|trail|toponyme|nom de famille|surname|prénom|given name|page d['’]homonymie");
/** Monument générique : bâtiment, site patrimonial. */
export const WD_GENERIC=_W("b[âa]timent|building|[ée]difice|structure|architectural structure|ouvrage|construction|attraction touristique|tourist attraction|lieu de m[ée]moire|site historique|historic site|lieu historique|patrimoine|heritage|site class[ée]|landmark|point of interest");
export const WD_GENERIC_MIN=8; // simple "batiment" : retenu des 8 langues
export const WD_UNKNOWN_STAR=20; // classe inconnue : gardee comme equipement generique si tres connue (>= 20 langues)
/** Type d'icône d'un monument d'après ses classes et son nom. @param {unknown} types @param {unknown} name */
export function monTypeFrom(types,name){
  const t=(String(types||'')+' '+String(name||'')).toLowerCase();
  if(/\barc\b|triumphal|porte de ville|city gate/.test(t)) return 'arc';
  if(/ob[ée]lisque|obelisk|colonne|column|statue/.test(t)) return 'colonne';
  if(/basilique|basilica|cath[ée]drale|cathedral|d[ôo]me|\bdome\b|mosqu[ée]e|mosque|synagogue|pantheon|panthéon|mausol[ée]e/.test(t)) return 'dome';
  if(/[ée]glise|church|chapelle|chapel|clocher|abbaye|abbey|monast[èe]re|monastery|couvent|convent|prieur[ée]|priory|clo[îi]tre|cloister/.test(t)) return 'clocher';
  if(/ch[âa]teau|castle|palais|palace|forteresse|fortress|citadelle|citadel|manoir|\bfort\b/.test(t)) return 'chateau';
  if(/\btour\b|tower|gratte-ciel|skyscraper|beffroi|belfry|phare|lighthouse|pyl[ôo]ne|pylon|[ée]metteur|transmitter|antenne/.test(t)) return 'tour';
  if(/h[ôo]tel de ville|town hall|mairie/.test(t)) return 'mairie';
  if(/maison|house|villa|h[ôo]tel particulier|logis|ferme|farm|immeuble|b[âa]timent|building/.test(t)) return 'maison';
  return 'musee';
}
/**
 * Trie un lieu Wikidata : monument, équipement ou écarté, avec la raison. Ordre : protégé > écarté > monument typique > équipement > générique > inconnu très célèbre.
 * @param {{types?: string, name?: string, links?: number, prot?: boolean}} m
 * @returns {{cat: 'monument'|'equip'|null, type?: string, minLinks?: number, why: string}}
 */
export function wdClassify(m){
  const t=String(m.types||'').toLowerCase(), links=m.links||0;
  if(m.prot) return {cat:'monument',type:monTypeFrom(t,m.name),why:'protégé (monument historique)'};
  if(WD_EXCL.test(t)) return {cat:null,why:'écarté (commune, quartier, événement, société, œuvre…)'};
  if(WD_MONS.test(t)) return {cat:'monument',type:monTypeFrom(t,m.name),why:'monument typique'};
  for(const [re,icon,min] of WD_EQUIP) if(re.test(t)) return {cat:'equip',type:icon,minLinks:min,why:'équipement : '+icon};
  if(WD_GENERIC.test(t)) return {cat:'monument',type:monTypeFrom(t,m.name),minLinks:WD_GENERIC_MIN,why:'bâtiment / site patrimonial'};
  if(links>=WD_UNKNOWN_STAR) return {cat:'equip',type:'edifice',minLinks:WD_UNKNOWN_STAR,why:'classe inconnue mais très connu'};
  return {cat:null,why:t?'classe non reconnue':'sans classe'};
}

/**
 * Requête Wikidata (même texte que le relais : sparqlMonuments() dans relais-worker.js). `full` : toutes les sous-classes ; sinon une liste de classes courantes.
 * @param {number} lat @param {number} lon @param {number} radiusKm @param {number} minLinks @param {boolean} full
 */
export function sparqlMon(lat,lon,radiusKm,minLinks,full){
  const cls=full?'VALUES ?root { wd:Q811979 wd:Q33506 wd:Q4989906 wd:Q570116 } ?i wdt:P31 ?t . ?t wdt:P279* ?root .'
    :'VALUES ?t { wd:Q12518 wd:Q1440300 wd:Q11303 wd:Q41176 wd:Q811979 wd:Q4989906 wd:Q570116 wd:Q16970 wd:Q2977 wd:Q317557 wd:Q108325 wd:Q23413 wd:Q16560 wd:Q33506 wd:Q12280 wd:Q483110 wd:Q179700 wd:Q1075 wd:Q1329623 wd:Q1081138 } ?i wdt:P31 ?t .';
  return `SELECT ?i ?iLabel ?sl ?lat ?lon (MAX(?hh) AS ?h) (GROUP_CONCAT(DISTINCT ?tl; separator="|") AS ?types) WHERE {
  SERVICE wikibase:around { ?i wdt:P625 ?loc . bd:serviceParam wikibase:center "Point(${lon.toFixed(5)} ${lat.toFixed(5)})"^^geo:wktLiteral . bd:serviceParam wikibase:radius "${radiusKm.toFixed(1)}" . }
  ?i wikibase:sitelinks ?sl . FILTER(?sl >= ${Math.round(minLinks)})
  ${cls}
  ?t rdfs:label ?tl . FILTER(LANG(?tl) IN ("fr","en"))
  BIND(geof:latitude(?loc) AS ?lat) BIND(geof:longitude(?loc) AS ?lon)
  OPTIONAL { ?i p:P2048/psn:P2048/wikibase:quantityAmount ?hh }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en". }
} GROUP BY ?i ?iLabel ?sl ?lat ?lon ORDER BY DESC(?sl) LIMIT 250`;
}
/**
 * Réponse WDQS brute → [{qid, name, lat, lon, links, ht, types}].
 * @param {any} j
 * @returns {{qid: string, name: string, lat: number, lon: number, links: number, ht: number|null, types: string}[]}
 */
export function normWdqs(j){
  const b=j&&j.results&&j.results.bindings; if(!Array.isArray(b)) throw new Error('format Wikidata inattendu');
  const out=[], seen=new Set();
  for(const r of b){ const q=r.i&&/Q\d+$/.exec(r.i.value||''); if(!q) continue;
    const name=r.iLabel&&r.iLabel.value; if(!name||/^Q\d+$/.test(name)) continue;
    const lat=parseFloat(r.lat&&r.lat.value), lon=parseFloat(r.lon&&r.lon.value); if(!isFinite(lat)||!isFinite(lon)||seen.has(q[0])) continue; seen.add(q[0]);
    const h=parseFloat(r.h&&r.h.value);
    out.push({qid:q[0],name,lat,lon,links:parseInt(r.sl&&r.sl.value,10)||0,ht:isFinite(h)&&h>0?Math.round(h):null,types:(r.types&&r.types.value)||''}); }
  return out;
}
