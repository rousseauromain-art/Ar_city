// Couches personnelles v2 = v1 : lecture d'un KML synthétique (aucune donnée réelle) par le vrai analyseur XML du navigateur. Compare l'analyse
// (points, colonnes, ignorés, liens, champs d'un tableau HTML, ExtendedData, SimpleData) et le diagnostic de structure, mot pour mot.
const {test,expect}=require('@playwright/test');
const {openApp}=require('../helpers/app.js');

const tableau=l=>'<table>'+l.map(([k,v])=>`<tr><td>${k}</td><td>${v}</td></tr>`).join('')+'</table>';
const KML=`<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Test</name>
<Folder><name>Sites</name>
<Placemark><name>Site Nord</name><description><![CDATA[${tableau([['Code','N01'],['Commune','Meudon &amp; Sèvres'],['Hauteur','42 m']])}]]></description><Point><coordinates>2.2300,48.8100,0</coordinates></Point></Placemark>
<Placemark><name>Site Sud</name><description><![CDATA[<p>Code : S02<br/>Commune : Paris<br/>Voir https://exemple.org/s02 et <a href="https://exemple.org/fiche?id=2&amp;x=1">la fiche</a></p>]]></description><Point><coordinates>2.3500,48.8300,0</coordinates></Point></Placemark>
<Placemark><name>Site Est</name><ExtendedData><Data name="Code"><value>E03</value></Data><Data name="Commune"><value>Vincennes</value></Data><Data name="Propriétaire"><value>Société X</value></Data></ExtendedData><Point><coordinates>2.4400,48.8470</coordinates></Point></Placemark>
<Placemark><name>Site Ouest</name><ExtendedData><SchemaData schemaUrl="#s"><SimpleData name="Code">O04</SimpleData><SimpleData name="@interne">caché</SimpleData></SchemaData></ExtendedData><description>Texte simple sans tableau.</description><Point><coordinates>2.2000,48.8600</coordinates></Point></Placemark>
<Placemark><name>Ligne</name><LineString><coordinates>2,48 2.1,48.1</coordinates></LineString></Placemark>
<Placemark><name>Zone</name><Polygon><outerBoundaryIs><LinearRing><coordinates>2,48 2.1,48.1 2.1,48 2,48</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
<Placemark><name>Hors monde</name><Point><coordinates>200,95</coordinates></Point></Placemark>
<Placemark><name>Zéro</name><Point><coordinates>0,0</coordinates></Point></Placemark>
<Placemark><name>${'Nom très long '.repeat(12)}</name><Point><coordinates>2.30,48.90</coordinates></Point></Placemark>
<Placemark><Point><coordinates>2.31,48.91</coordinates></Point></Placemark>
</Folder></Document></kml>`;
const CASSE='<kml><Document><Placemark></kml>';

test('couches perso v2 = v1 : analyse et diagnostic d’un KML synthétique',async({page})=>{
  const app=await openApp(page,{pos:{lat:48.85,lon:2.3}});
  const v1=await page.evaluate(([txt])=>{
    const doc=new DOMParser().parseFromString(txt,'application/xml'), res=window.__vh.ev('parseKml')(txt,doc);
    const meta={zip:false,size:txt.length,ents:null,pick:''};
    return {res,diag:window.__vh.ev('kmlDiag')(txt,meta,{doc,res}),diagSeul:window.__vh.ev('kmlDiag')(txt,meta)};
  },[KML]);
  const v2=await page.evaluate(async([txt])=>{
    const k=await import('/src/donnees/kml.js'), d=await import('/src/donnees/kml-diagnostic.js');
    const doc=new DOMParser().parseFromString(txt,'application/xml'), res=k.analyserKml(txt,doc);
    const meta={zip:false,size:txt.length,ents:null,pick:''};
    const octets=new TextEncoder().encode(txt).buffer, imp=await k.importerCouche({octets,nom:'Mes sites.kml',rang:7,maintenant:1700000000000,aleatoire:()=>0.5});
    return {res,diag:d.diagnosticKml(txt,meta,{doc,res}),diagSeul:d.diagnosticKml(txt,meta),
      couche:{name:imp.couche.name,color:imp.couche.color,max:imp.couche.max,on:imp.couche.on,id:imp.couche.id,n:imp.couche.items.length,coupe:imp.coupe}};
  },[KML]);
  console.log('points',v1.res.pts.length,'· colonnes',v1.res.cols.join(','),'· ignorés',v1.res.ignored);
  expect(v1.res.pts.length,'le KML de test doit donner des points').toBeGreaterThan(4);
  expect(v2.res,'analyse du KML').toEqual(v1.res);
  expect(v2.diag,'diagnostic de structure').toBe(v1.diag);
  expect(v2.diagSeul,'diagnostic sans analyse préalable').toBe(v1.diagSeul);
  expect(v1.diag).not.toMatch(/Société X|Vincennes|exemple\.org/); // jamais une valeur
  expect(v2.couche).toEqual({name:'Mes sites',color:'#A98BFF',max:50,on:true,id:(1700000000000).toString(36)+'i',n:v1.res.pts.length,coupe:false});
  // KML illisible : la même erreur
  const e1=await page.evaluate(([txt])=>{ try{ window.__vh.ev('parseKml')(txt); return ''; }catch(e){ return e.message; } },[CASSE]);
  const e2=await page.evaluate(async([txt])=>{ const k=await import('/src/donnees/kml.js'); try{ k.analyserKml(txt); return ''; }catch(e){ return e.message; } },[CASSE]);
  expect(e1).toMatch(/illisible/); expect(e2).toBe(e1);
  expect(app.errors).toEqual([]);
});
