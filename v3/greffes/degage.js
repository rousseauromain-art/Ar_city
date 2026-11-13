// Greffe « degage » (ajout, éteinte par défaut) : un écran dégagé pour lire les noms. Constat du 13/11/2026 (photo de Turin) : en paysage, les puces
// et le bandeau de la photo couvrent un quart de l'écran (785 × 126 px sur 915 × 412), la colonne de boutons et la barre du bas encore une part, et le
// plein écran de la v1 ne retire rien de tout cela.
//  - Le bouton ÉCRAN passe en plein écran (comme la v1) ET masque les puces, la colonne de boutons et la barre du bas : il ne reste que l'image, le
//    tracé et les noms, qui peuvent occuper le bas de l'écran (les boutons n'y sont plus des obstacles). Un petit bouton, en haut à droite, ramène tout.
//    Quitter le plein écran par le geste « retour » du téléphone ramène tout aussi.
//  - En photo rejouée, le bandeau (deux lignes sur toute la largeur) est replié en une petite puce « 📷 photo » ; un toucher le déplie, un autre le replie.
// Aucun point d'entrée dans le code de la v1 : la greffe écoute le bouton ÉCRAN et pose des règles d'affichage.
let c=null, degage=false, deplie=false;
function regler(v){ degage=!!v; document.body.classList.toggle('g3Degage',degage); }
function majPhoto(){ const p=c.$('g3Photo'); if(!p) return; p.hidden=!c.photoMode; p.textContent=deplie?'📷 photo · replier':'📷 photo · détails'; document.body.classList.toggle('g3PhotoDeplie',deplie&&!!c.photoMode); }
export default {
  init(ctx){
    c=ctx;
    const st=document.createElement('style'); st.id='g3DegageSt';
    st.textContent='body.g3Degage #chips,body.g3Degage #tools,body.g3Degage #bar,body.g3Degage #layers{display:none!important}'
      +'#g3Retour{display:none;position:absolute;top:calc(var(--safe-t) + 34px);right:calc(12px + var(--safe-r));z-index:4;width:44px;height:44px;align-items:center;justify-content:center;border-radius:4px;background:rgba(14,26,43,.5);color:var(--cream);font:700 20px/1 system-ui,sans-serif}'
      +'body.g3Degage #g3Retour{display:flex}'
      +'body.g3D #photoChip{display:none!important}body.g3D.g3PhotoDeplie #photoChip{display:block!important}#g3Photo{pointer-events:auto;cursor:pointer}';
    document.head.appendChild(st); document.body.classList.add('g3D');
    const fs=c.$('btnFs');
    if(fs){ fs.addEventListener('click',()=>regler(!degage)); // le plein écran de la v1 se fait par son propre onclick
      const r=Object.assign(document.createElement('button'),{id:'g3Retour',type:'button',textContent:'⤡'}); r.setAttribute('aria-label','Retrouver les boutons');
      r.onclick=()=>fs.click(); (fs.closest('#tools')||fs).after(r);
      const sortie=()=>{ if(degage&&!(document.fullscreenElement||document.webkitFullscreenElement)) regler(false); }; // geste « retour » du téléphone
      document.addEventListener('fullscreenchange',sortie); document.addEventListener('webkitfullscreenchange',sortie); }
    const pc=c.$('photoChip');
    if(pc&&!c.$('g3Photo')){ const p=document.createElement('div'); p.id='g3Photo'; p.className='chip'; p.hidden=true; p.onclick=()=>{ deplie=!deplie; majPhoto(); }; pc.before(p);
      new MutationObserver(majPhoto).observe(pc,{attributes:true,attributeFilter:['hidden']}); majPhoto(); }
  },
  regler, etat:()=>({degage,deplie}),
  statut:()=>`degage : ${degage?'écran dégagé (bouton ⤡ en haut à droite pour retrouver les boutons)':'bouton ÉCRAN = plein écran sans puces ni boutons'}${c.photoMode?` · bandeau de la photo ${deplie?'déplié':'replié'}`:''}`,
};
