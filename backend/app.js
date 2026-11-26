// La aplicación Express. server.js la arranca.
// Autenticación: SOLO JWT (sin express-session ni tabla sessions). El navegador manda  Authorization: Bearer <token>.
const path = require('path');
const express = require('express');
const multer = require('multer');
const { ErrorHttp } = require('./utilidades');


//Es como el llamado de los avengers jejeje, rd como el doctor strange abriendo portales 
const { crearModeloUsuarios } = require('./modelos/usuarios.modelo');
const { crearModeloTokens } = require('./modelos/tokens.modelo');
const { crearModeloCatalogos } = require('./modelos/catalogos.modelo');
const { crearModeloPublicaciones } = require('./modelos/publicaciones.modelo');
const { crearModeloSolicitudes } = require('./modelos/solicitudes.modelo');
const { crearModeloMensajes } = require('./modelos/mensajes.modelo');
const { crearModeloCalificaciones } = require('./modelos/calificaciones.modelo');
const { crearModeloModeracion } = require('./modelos/moderacion.modelo');

const { crearJWT } = require('./middlewares/jwt.middleware');
const { crearSesion } = require('./middlewares/sesion.middleware');
const { subirFoto } = require('./middlewares/upload.middleware');
const { crearCors } = require('./middlewares/cors.middleware');

function crearApp(config, pool) {
  const app = express();
  app.set('trust proxy', 1); 
  app.use(crearCors(process.env.CORS_ORIGINS)); 
  app.use(express.json({ limit: '100kb' }));

  const limitadorAuth = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 5, 
    message: { error: 'Demasiados intentos, intenta más tarde' }
  });

  //Modelos que ya estan dentro de , y hablan con las tablas 
  const modelos = {
    usuarios: crearModeloUsuarios(pool),
    tokens: crearModeloTokens(pool),
    catalogos: crearModeloCatalogos(pool),
    publicaciones: crearModeloPublicaciones(pool),
    solicitudes: crearModeloSolicitudes(pool),
    mensajes: crearModeloMensajes(pool),
    calificaciones: crearModeloCalificaciones(pool),
    moderacion: crearModeloModeracion(pool),
  };

  // Aqui se hace autenticidad
  const jwtAuth = crearJWT(config, modelos.tokens);
  const sesion = crearSesion(jwtAuth, modelos.usuarios);

  
  const ctx = {
    modelos, jwtAuth,
    requiereSesion: sesion.requiereSesion,
    requiereRol: sesion.requiereRol,
    // Aqui le decimos a mmi amigo adminn que el no opertenece a esta fiest por que el solo observa como suben publis
    soloUsuarios: sesion.requiereRol('usuario'),
    subirFotoPerfil: subirFoto('perfiles'),
    subirFotoPublicacion: subirFoto('publicaciones'),
  };

 
  app.locals.contexto = { modelos, jwtAuth, sesion };

  // Rutas de la API
  app.use('/api/auth', require('./rutas/auth.rutas').crearRutas(ctx));
  app.use('/api/catalogos', require('./rutas/catalogos.rutas').crearRutas(ctx));
  app.use('/api/perfiles', require('./rutas/perfiles.rutas').crearRutas(ctx));
  app.use('/api/publicaciones', require('./rutas/publicaciones.rutas').crearRutas(ctx));
  app.use('/api/solicitudes', require('./rutas/solicitudes.rutas').crearRutas(ctx));
  app.use('/api/mensajes', require('./rutas/mensajes.rutas').crearRutas(ctx));
  app.use('/api/calificaciones', require('./rutas/calificaciones.rutas').crearRutas(ctx));
  app.use('/api/reportes', require('./rutas/reportes.rutas').crearRutas(ctx));
  app.use('/api/admin', require('./rutas/admin.rutas').crearRutas(ctx));

 
 
 
  if (process.env.SERVIR_FRONT === 'si') app.use(express.static(path.join(__dirname, '..', 'frontend')));


  app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));


  app.use((error, req, res, next) => {
    if (error instanceof ErrorHttp) return res.status(error.status).json({ error: error.message, ...(error.datos || {}) });
    if (error instanceof multer.MulterError) {
      const msg = error.code === 'LIMIT_FILE_SIZE' ? 'La foto pesa demasiado (máximo 3 MB)' : 'No se pudo subir la foto';
      return res.status(400).json({ error: msg });
    }
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'El cuerpo no es un JSON válido' });
    if (error.code === '23503') return res.status(400).json({ error: 'Uno de los datos enviados no existe' });
    console.error(error);
    res.status(500).json({ error: 'Error en el servidor' });
  });

  return app;
}

module.exports = { crearApp };
