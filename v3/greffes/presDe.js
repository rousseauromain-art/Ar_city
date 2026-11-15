// Greffe « presDe » (ajout, éteinte par défaut). La capture écrit « Près de <lieu habité visible le plus proche> » (bouton déclencheur) ; rien de tel n'était affiché en direct.
// La greffe pose une puce à côté de l'état, mise à jour toutes les 2 s avec le même calcul que la capture (ctx.lieuProche : lieux habités visibles, le plus proche).
let c=null, puce=null;
/** « Près de Pont-en-Royans », « Près d'Auberives » : même élision que la légende de la capture. */
export function libelle(nom){
  if(!nom) return '';
  return (/^[aeiouyhàâäéèêëîïôöûüAEIOUYHÀÂÄÉÈÊËÎÏÔÖÛÜ]/.test(nom)?'Près d\'':'Près de ')+nom;
}
function maj(){
  if(!puce||!c) return;
  let near=null; try{ near=c.lieuProche(); }catch(e){}
  const t=libelle(near&&near.name); puce.hidden=!t; if(t&&puce.textContent!==t) puce.textContent=t;
}
export default {
  init(ctx){
    c=ctx; const st=c.$('status'); if(!st||c.$('g3Pres')) return;
    puce=Object.assign(document.createElement('div'),{id:'g3Pres',className:'chip',hidden:true}); st.after(puce);
    maj(); setInterval(maj,2000);
  },
  libelle,
  /** Texte affiché (tests). */
  texte:()=>puce&&!puce.hidden?puce.textContent:'',
  maj,
};
