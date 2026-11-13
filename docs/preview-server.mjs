import http from 'node:http';
import fs from 'node:fs';
const file=new URL('../design-preview.html',import.meta.url);
http.createServer((req,res)=>{if(req.url==='/'||req.url==='/design-preview.html'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(fs.readFileSync(file));}else{res.writeHead(404);res.end();}}).listen(1420,'127.0.0.1',()=>console.log('Design preview: http://127.0.0.1:1420/design-preview.html'));
