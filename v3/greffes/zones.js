// Greffe « zones » (ajout, éteinte par défaut). Constat de la sortie de Pont-en-Royans (14/11) : les noms de zones des tables d'orientation (gorges de la Bourne, Rochers de Presles, forêt des
// Coulmes…) sont dans les lignes Wikidata déjà chargées, mais la v1 les range parmi les « classes non reconnues » (ni monument ni équipement) et les écarte. La greffe, appelée au tri des
// lignes Wikidata (point d'entrée dans applyMonuments) :
//  - retient les lignes écartées dont la classe est une zone naturelle (région naturelle, gorge, défilé, canyon, crête, massif, vallée, forêt, grotte, plateau, falaise, karst, col) ;
//  - les ajoute aux sommets lointains (comme la greffe montagne, avec un drapeau `zone`) : même placement des noms, vert pour les zones de montagne ;
//  - ne les masque pas par le relief (le centre d'une gorge est dans la vallée : il serait toujours « caché ») : point d'entrée dans applyOcclusion.
// Aucune requête de plus. Les lieux-dits et noms d'Overpass (natural=gorge|ridge|valley…) ne sont pas encore demandés.
export const CLASSES=/r[ée]gion naturelle|natural region|gorge|d[ée]fil[ée]|canyon|cr[êe]te|ridge|massif|mountain range|cha[iî]ne de montagnes|vall[ée]e|valley|for[êe]t|forest|grotte|cave|plateau|falaise|cliff|karst|\bcol\b|mountain pass/i;
const MONTAGNE=/r[ée]gion naturelle|natural region|gorge|d[ée]fil[ée]|canyon|cr[êe]te|ridge|massif|mountain range|cha[iî]ne de montagnes|falaise|cliff|\bcol\b|mountain pass|plateau|karst/i;
// zone ponctuelle (col, pas, grotte, scialet, trou, gouffre, cascade…) : un lieu précis, testé comme un point par la greffe visibilite ; les autres sont étendues
export const PONCTUEL=/\bcol\b|mountain pass|\bpas\b|grotte|\bcave\b|scialet|\btrou\b|gouffre|\baven\b|cascade|waterfall|r[ée]surgence|antre|\bpot\b/i;
let c=null; const zones=new Map(); let minuteur=null;
/** Une ligne Wikidata écartée {qid,name,lat,lon,types} est-elle une zone naturelle ? Renvoie l'objet à ajouter (genre `peak` pour la montagne, `rock` sinon) ou null. Pure. */
export function zoneDe(m){
  if(!m||!m.name||!isFinite(m.lat)||!isFinite(m.lon)||/^Q\d+$/.test(m.name)) return null;
  const t=String(m.types||''); if(!CLASSES.test(t)||/\bpont\b|\bbridge\b/i.test(t)||/^pont\b/i.test(m.name)) return null; // un pont n'est pas une zone
  return {name:m.name,lat:m.lat,lon:m.lon,kind:MONTAGNE.test(t)?'peak':'rock',pop:0,ele:null,farPeak:true,zone:true,qid:m.qid||null,types:t,nature:PONCTUEL.test(t+' '+m.name)?'point':'etendue'};
}
function appliquer(){
  minuteur=null; if(!c||!zones.size) return;
  const actuels=c.farPeaks, noms=new Set(actuels.filter(x=>!x.zone).map(x=>x.name.toLowerCase()));
  const aj=[...zones.values()].filter(z=>!noms.has(z.name.toLowerCase())); // un sommet de même nom (montagne, OpenFreeMap) reste prioritaire
  if(actuels.filter(x=>x.zone).length===aj.length&&aj.every(z=>actuels.includes(z))) return;
  c.setFarPeaks(actuels.filter(x=>!x.zone).concat(aj));
}
export default {
  init(ctx){ c=ctx; setInterval(()=>{ if(zones.size&&!c.farPeaks.some(x=>x.zone)) appliquer(); },3000); }, // le rechargement des sommets lointains par la v1 efface les zones : on les remet
  CLASSES,zoneDe,
  /** Point d'entrée : ligne Wikidata écartée par le tri des monuments. */
  noter(m){ const z=zoneDe(m); if(!z) return; const k=z.qid||z.name+'@'+z.lat.toFixed(3); if(zones.has(k)) return; zones.set(k,z); if(!minuteur) minuteur=setTimeout(appliquer,300); },
  zones:()=>[...zones.values()],
  statut:()=>`zones : ${zones.size} zone(s) naturelle(s) retenue(s) parmi les lignes Wikidata écartées`,
};
