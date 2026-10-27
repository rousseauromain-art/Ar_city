// Serveur http local des tests : sert le depot tel quel (comme GitHub Pages) et, pour v1/villes-horizon.html seulement,
// injecte le crochet de test (hook.js) juste avant le dernier "})();" du script principal.
const http=require('http'), fs=require('fs'), path=require('path');
const ROOT=path.resolve(__dirname,'..','..');
const HOOK=fs.readFileSync(path.join(__dirname,'hook.js'),'utf8');
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css',
  '.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.webp':'image/webp','.kml':'application/vnd.google-earth.kml+xml'};

function injectHook(html){
  const i=html.lastIndexOf('})();');
  if(i<0) throw new Error('crochet de test : "})();" introuvable dans v1/villes-horizon.html');
  return html.slice(0,i)+'\n/*__VH_TEST_HOOK__*/\n'+HOOK+'\n'+html.slice(i);
}

function start(port){
  const srv=http.createServer((req,res)=>{
    const u=new URL(req.url,'http://x'); let p=decodeURIComponent(u.pathname);
    if(p.endsWith('/')) p+='index.html';
    const f=path.join(ROOT,p);
    if(!f.startsWith(ROOT)){ res.writeHead(403); return res.end(); }
    fs.readFile(f,(err,buf)=>{
      if(err){ res.writeHead(404,{'Content-Type':'text/plain'}); return res.end('404'); }
      let body=buf;
      if(p==='/v1/villes-horizon.html'&&u.searchParams.get('nohook')==null) body=injectHook(buf.toString('utf8'));
      res.writeHead(200,{'Content-Type':TYPES[path.extname(f).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});
      res.end(body);
    });
  });
  return new Promise(r=>srv.listen(port,'127.0.0.1',()=>r(srv)));
}

module.exports={start,injectHook,ROOT};
if(require.main===module){
  const port=+(process.env.PORT||4173);
  start(port).then(()=>console.log(`Villes a l'horizon (tests) : http://127.0.0.1:${port}/v1/villes-horizon.html`));
}
