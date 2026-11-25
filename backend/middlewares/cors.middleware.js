// CORS: permite que el FRONTEND (que corre en OTRA computadora o puerto) hable con esta API.
// Sin esto el navegador bloquea las peticiones entre orígenes distintos.
//
// Se configura en el .env:
//   CORS_ORIGINS=*                                  → cualquier origen (lo más fácil en la red de la escuela)
//   CORS_ORIGINS=http://192.168.20.5:5500           → solo ese frontend (puedes poner varios separados por coma)
//
// Es seguro dejar "*" porque la sesión va en el JWT del encabezado Authorization, no en cookies:
// una página ajena no puede usar tu sesión sin tener tu token.
function crearCors(listaTexto) {
  const permitidos = String(listaTexto || '*').split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean);
  const todos = permitidos.includes('*');

  return (req, res, next) => {
    const origen = req.headers.origin;
    if (origen && (todos || permitidos.includes(origen))) {
      res.setHeader('Access-Control-Allow-Origin', todos ? '*' : origen);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Max-Age', '600'); // el navegador recuerda el permiso 10 min
    }
    // "Preflight": el navegador pregunta con OPTIONS si puede hacer la petición real.
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  };
}

module.exports = { crearCors };
