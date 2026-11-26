const express = require('express');
const { enumerado } = require('../utilidades');

function crearRutas({ modelos }) {
  const router = express.Router();
  router.get('/alcaldias', async (req, res) => res.json(await modelos.catalogos.alcaldias()));
  router.get('/categorias', async (req, res) => res.json(await modelos.catalogos.categorias()));
  router.get('/motivos', async (req, res) => {
    const tipo = req.query.tipo ? enumerado(req.query.tipo, 'tipo', ['publicacion', 'perfil']) : null;
    res.json(await modelos.catalogos.motivos(tipo));
  });
  return router;
}

module.exports = { crearRutas };
