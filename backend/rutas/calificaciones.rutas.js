// /api/calificaciones → calificar al terminar una entrega y ver las que recibió una persona.
const express = require('express');
const { ErrorHttp, texto, entero } = require('../utilidades');

function crearRutas({ modelos, requiereSesion, soloUsuarios }) {
  const router = express.Router();
  router.use(requiereSesion, soloUsuarios); // el admin no usa esta parte

  // GET /api/calificaciones/pendientes → lo que me falta calificar
  router.get('/pendientes', async (req, res) => res.json(await modelos.calificaciones.pendientes(req.usuario.idusuario)));

  // POST /api/calificaciones  { idsolicitud, puntualidad, actitud, veracidad?, comentario? }  (cada criterio de 0 a 5)
  router.post('/', async (req, res) => {
    const b = req.body || {};
    await modelos.calificaciones.crear(req.usuario.idusuario, {
      idsolicitud: entero(b.idsolicitud, 'La solicitud'),
      puntualidad: entero(b.puntualidad, 'La puntualidad', { min: 0, max: 5 }),
      actitud: entero(b.actitud, 'La actitud', { min: 0, max: 5 }),
      veracidad: entero(b.veracidad, 'La veracidad', { min: 0, max: 5, opcional: true }),
      comentario: texto(b.comentario, 'El comentario', { max: 255, opcional: true }),
    });
    res.status(201).json({ mensaje: 'Calificación guardada' });
  });

  // GET /api/calificaciones/usuario/:id → las que recibió esa persona
  router.get('/usuario/:id', async (req, res) => {
    const id = entero(req.params.id, 'id');
    if (!(await modelos.usuarios.obtenerPublico(id))) throw new ErrorHttp(404, 'El perfil no existe');
    res.json(await modelos.calificaciones.recibidas(id));
  });

  return router;
}

module.exports = { crearRutas };
