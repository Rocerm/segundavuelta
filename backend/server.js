// Punto de entrada:  npm start
const http = require('http');
const os = require('os');
const { crearApp } = require('./app');
const { crearPool } = require('./db');
const { crearSocketChat } = require('./sockets/chat.socket');
const config = require('./config');

const PUERTO = Number(process.env.PORT || 4600);
const HOST = process.env.HOST || '0.0.0.0'; // 0.0.0.0 = acepta conexiones de OTRAS computadoras de la red

// IPs de esta computadora en la red (para decirle al frontend a dónde conectarse).
function ipsDeRed() {
  return Object.values(os.networkInterfaces()).flat().filter((i) => i.family === 'IPv4' && !i.internal).map((i) => i.address);
}

// Sin secreto no se pueden firmar tokens de forma segura: mejor no arrancar.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('Falta JWT_SECRET en tu archivo .env (mínimo 16 caracteres). Mira .env.example');
  process.exit(1);
}

const pool = crearPool();

// Antes de arrancar, comprueba que PostgreSQL (Supabase) responde y que la base tiene sus tablas.
pool
  .query('SELECT COUNT(*) AS total FROM usuarios')
  .then(async ([filas]) => {
    // Revisa que la base tenga las columnas/tablas nuevas (apelaciones, revertidas, caducidad por categoría).
    await pool.query('SELECT s.fecha_revertida, c.permite_caducidad FROM sanciones s, categorias c LIMIT 1');
    await pool.query('SELECT 1 FROM apelaciones LIMIT 1');
    const app = crearApp(config, pool);
    const servidor = http.createServer(app); // se usa http.createServer para que el WebSocket comparta el puerto
    const { modelos, jwtAuth, sesion } = app.locals.contexto;

    // Chat en tiempo real; las rutas HTTP usan app.locals.difundir para avisar a los conectados.
    app.locals.difundir = crearSocketChat(servidor, { sesion, jwtAuth, modelos }).difundir;

    // Cada hora se borran de la lista negra los tokens que ya vencieron.
    if (config.jwtRevocar) {
      setInterval(() => modelos.tokens.limpiarVencidos().catch((e) => console.error('Limpieza de tokens:', e.message)), config.limpiezaTokensMs).unref();
    }

    servidor.listen(PUERTO, HOST, () => {
      console.log(`Segunda Vuelta (BACKEND) escuchando en el puerto ${PUERTO}`);
      console.log('  En esta compu:         http://localhost:' + PUERTO);
      ipsDeRed().forEach((ip) => console.log(`  Desde otras compus:    http://${ip}:${PUERTO}   ← esta IP va en frontend/js/config.js`));
      console.log(`  CORS permitido para:   ${process.env.CORS_ORIGINS || '*'}`);
      console.log(`Usuarios en Supabase: ${filas[0].total}`);
      console.log(`Autenticación: JWT (expira en ${config.jwtExpiraSeg}s, lista negra ${config.jwtRevocar ? 'activada' : 'desactivada'})`);
    });
  })
  .catch((error) => {
    if (error.code === '42703' || error.code === '42P01') {
      console.error('Tu base de datos tiene el esquema ANTERIOR o incompleto (' + error.message + ').');
      console.error('Ejecuta el script SQL completo en el SQL Editor de Supabase.');
      process.exit(1);
    }
    console.error('No me pude conectar a Supabase (PostgreSQL):', error.message);
    console.error('Revisa tu variable DATABASE_URL en el archivo .env y tu conexión a internet.');
    process.exit(1);
  });
