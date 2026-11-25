// Servidor mínimo para el FRONTEND (sin instalar nada: solo Node).
//   node servidor.js      (o  npm start)       →  http://localhost:5500
// Entrega los HTML/CSS/JS de esta carpeta. La API NO está aquí: está en el backend (ver js/config.js).
// Si prefieres, también sirve Live Server de VS Code abierto en esta carpeta (frontend/).
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PUERTO = Number(process.env.PORT || 5500);
const RAIZ = __dirname;
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  let ruta;
  try { ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { res.writeHead(400); return res.end('Petición inválida'); }
  if (ruta === '/') ruta = '/index.html';
  const archivo = path.join(RAIZ, ruta);
  // Seguridad: solo se entregan archivos dentro de esta carpeta (nada de ../), y nunca este mismo servidor.
  if (!archivo.startsWith(RAIZ + path.sep) || path.basename(archivo) === 'servidor.js') { res.writeHead(403); return res.end('Prohibido'); }
  fs.readFile(archivo, (error, datos) => {
    if (error) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream' });
    res.end(datos);
  });
}).listen(PUERTO, '0.0.0.0', () => {
  console.log(`Segunda Vuelta (FRONTEND) en http://localhost:${PUERTO}`);
  Object.values(os.networkInterfaces()).flat().filter((i) => i.family === 'IPv4' && !i.internal)
    .forEach((i) => console.log(`  Desde otras compus:  http://${i.address}:${PUERTO}`));
  console.log('Recuerda poner la IP del BACKEND en js/config.js (o abrir login.html?api=http://IP:4600 una vez).');
});
