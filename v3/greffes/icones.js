// Greffe « icones » (remplacement, éteinte par défaut) : un libellé sous chaque icône de la colonne de boutons (v2 étape 11d : v2/ar.html, ui/style.css `#tools .lbl`).
// Les boutons, leurs titres et toutes les aides « ? » de la v1 restent tels quels ; seule la présentation des boutons change. Aucun point d'entrée dans le code de la v1.
export const LIBELLES={btnLayers:'Calques',btnFind:'Cherch.',btnAlign:'Caler',btnPoint:'Pointer',btnReload:'Relire',btnFs:'Écran'};
export default {
  init(c){
    const st=document.createElement('style'); st.id='g3Icones';
    st.textContent='#tools button{flex-direction:column;gap:2px}#tools .lbl{font:600 8px/1 var(--display);letter-spacing:.01em;text-transform:uppercase;color:var(--cream);opacity:.85;pointer-events:none}';
    document.head.appendChild(st);
    for(const [id,t] of Object.entries(LIBELLES)){ const b=c.$(id); if(!b||b.querySelector('.lbl')) continue; const s=document.createElement('span'); s.className='lbl'; s.textContent=t; b.appendChild(s); }
  },
};
