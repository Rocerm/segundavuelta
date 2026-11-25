// /api/solicitudes → pedir un artículo y que el dueño acepte, rechace o confirme la entrega.
const express = require('express');
const { ErrorHttp, texto, entero } = require('../utilidades');

function crearRutas({ modelos, requiereSesion, soloUsuarios }) {
  const router = express.Router();
  router.use(requiereSesion, soloUsuarios); // el admin no usa esta parte
  const sols = modelos.solicitudes;

  // POST /api/solicitudes  { idpublicacion, mensaje, idpublicacion_ofrecida? }
  router.post('/', async (req, res) => {
    const b = req.body || {};
    const id = await sols.crear(req.usuario.idusuario, {
      idpublicacion: entero(b.idpublicacion, 'La publicación'),
      mensaje: texto(b.mensaje, 'El mensaje', { min: 2, max: 500, multilinea: true }),
      idpublicacion_ofrecida: entero(b.idpublicacion_ofrecida, 'La publicación ofrecida', { opcional: true }),
    });
    res.status(201).json({ idsolicitud: id });
  });

  router.get('/enviadas', async (req, res) => res.json(await sols.enviadas(req.usuario.idusuario)));

  // GET /api/solicitudes/recibidas?publicacion=5  (el filtro es opcional)
  router.get('/recibidas', async (req, res) => {
    const idpub = entero(req.query.publicacion, 'publicacion', { opcional: true });
    res.json(await sols.recibidas(req.usuario.idusuario, idpub));
  });

  // GET /api/solicitudes/:id → solo la ven el dueño y el solicitante
  router.get('/:id', async (req, res) => {
    const s = await sols.obtener(entero(req.params.id, 'id'));
    if (!s || !sols.esParticipante(s, req.usuario.idusuario)) throw new ErrorHttp(404, 'La solicitud no existe');
    res.json(s);
  });

  // PATCH /api/solicitudes/:id/aceptar | rechazar | completar   (solo el dueño de la publicación)
  for (const [accion, estado] of [['aceptar', 'aceptada'], ['rechazar', 'rechazada'], ['completar', 'completada']]) {
    router.patch(`/:id/${accion}`, async (req, res) => {
      await sols.cambiarEstado(entero(req.params.id, 'id'), req.usuario.idusuario, estado);
      res.json({ estado });
    });
  }

  return router;
}

module.exports = { crearRutas };
