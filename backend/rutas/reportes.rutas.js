// /api/reportes → cualquier usuario reporta una publicación o un perfil. (El admin los atiende en /api/admin.)
const express = require('express');
const { texto, entero } = require('../utilidades');

function crearRutas({ modelos, requiereSesion, soloUsuarios }) {
  const router = express.Router();
  router.use(requiereSesion, soloUsuarios); // el admin no usa esta parte

  // POST /api/reportes  { idpublicacion | idusuario_reportado, idmotivo, comentario? }
  router.post('/', async (req, res) => {
    const b = req.body || {};
    const id = await modelos.moderacion.crearReporte(req.usuario.idusuario, {
      idpublicacion: entero(b.idpublicacion, 'La publicación', { opcional: true }),
      idusuario_reportado: entero(b.idusuario_reportado, 'El usuario', { opcional: true }),
      idmotivo: entero(b.idmotivo, 'El motivo'),
      comentario: texto(b.comentario, 'El comentario', { max: 500, opcional: true, multilinea: true }),
    });
    res.status(201).json({ idreporte: id, mensaje: 'Gracias, revisaremos tu reporte' });
  });

  return router;
}

module.exports = { crearRutas };
