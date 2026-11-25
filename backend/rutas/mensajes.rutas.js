// /api/mensajes → historial del chat de una solicitud y envío por HTTP (el tiempo real va por WebSocket).
const express = require('express');
const { ErrorHttp, entero } = require('../utilidades');

function crearRutas({ modelos, requiereSesion, soloUsuarios }) {
  const router = express.Router();
  router.use(requiereSesion, soloUsuarios); // el admin no usa esta parte

  // Solo participan dueño y solicitante. Se responde 404 (no 403) para no revelar que la solicitud existe.
  async function solicitudDelChat(req) {
    const s = await modelos.solicitudes.obtener(entero(req.params.idsolicitud, 'idsolicitud'));
    if (!s || !modelos.solicitudes.esParticipante(s, req.usuario.idusuario)) throw new ErrorHttp(404, 'La solicitud no existe');
    return s;
  }

  // GET /api/mensajes/solicitud/:idsolicitud?despues=10
  router.get('/solicitud/:idsolicitud', async (req, res) => {
    const s = await solicitudDelChat(req);
    const despues = entero(req.query.despues, 'despues', { min: 0, opcional: true }) || 0;
    res.json(await modelos.mensajes.listar(s.idsolicitud, despues));
  });

  // POST /api/mensajes/solicitud/:idsolicitud  { contenido }
  router.post('/solicitud/:idsolicitud', async (req, res) => {
    const s = await solicitudDelChat(req);
    // Como en el wireframe: el chat se habilita cuando el dueño acepta la solicitud.
    if (s.estado !== 'aceptada') throw new ErrorHttp(409, 'El chat se habilita cuando la solicitud está aceptada');
    const mensaje = await modelos.mensajes.crear(s.idsolicitud, req.usuario.idusuario, req.body && req.body.contenido);
    // Si hay alguien conectado por WebSocket a ese chat, le llega al instante.
    if (req.app.locals.difundir) req.app.locals.difundir(s.idsolicitud, mensaje);
    res.status(201).json(mensaje);
  });

  return router;
}

module.exports = { crearRutas };
