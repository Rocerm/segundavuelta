// /api/perfiles → perfil, foto, intereses, ajustes (nombre, alcaldía, contraseña), avisos y eliminar cuenta.
const express = require('express');
const config = require('../config');
const { ErrorHttp, texto, nombrePersona, contrasena, entero } = require('../utilidades');
const { rutaPublica, borrarArchivo } = require('../middlewares/upload.middleware');

function crearRutas({ modelos, requiereSesion, soloUsuarios, subirFotoPerfil }) {
  const router = express.Router();
  router.use(requiereSesion); // todo lo de perfiles necesita sesión

  router.get('/yo', async (req, res) => res.json(await modelos.usuarios.obtenerPropio(req.usuario.idusuario)));

  router.put('/yo', async (req, res) => {
    const b = req.body || {};
    const actual = await modelos.usuarios.obtenerPropio(req.usuario.idusuario);
    await modelos.usuarios.actualizar(req.usuario.idusuario, {
      nombre: b.nombre !== undefined ? nombrePersona(b.nombre, 'El nombre') : actual.nombre,
      apellido: b.apellido !== undefined ? nombrePersona(b.apellido, 'El apellido') : actual.apellido,
      biografia: b.biografia !== undefined ? texto(b.biografia, 'La biografía', { max: 255, opcional: true, multilinea: true }) : actual.biografia,
      idalcaldia: b.idalcaldia !== undefined ? entero(b.idalcaldia, 'La alcaldía') : actual.idalcaldia,
    });
    res.json(await modelos.usuarios.obtenerPropio(req.usuario.idusuario));
  });

  router.post('/yo/contrasena', async (req, res) => {
    const b = req.body || {};
    await modelos.usuarios.cambiarContrasena(req.usuario.idusuario, b.actual, contrasena(b.nueva, 'La contraseña nueva'));
    res.json({ mensaje: 'Contraseña actualizada' });
  });

  router.post('/yo/foto', subirFotoPerfil, async (req, res) => {
    if (!req.file) throw new ErrorHttp(400, 'Falta la foto');
    const ruta = await rutaPublica('perfiles', req.file);
    borrarArchivo(await modelos.usuarios.cambiarFoto(req.usuario.idusuario, ruta)); // se borra la foto anterior
    res.json({ foto_perfil: ruta });
  });

  router.get('/yo/intereses', soloUsuarios, async (req, res) => res.json(await modelos.usuarios.obtenerIntereses(req.usuario.idusuario)));

  router.put('/yo/intereses', soloUsuarios, async (req, res) => {
    const lista = req.body && req.body.categorias;
    if (!Array.isArray(lista) || lista.length > 50) throw new ErrorHttp(400, 'categorias debe ser una lista');
    const ids = [...new Set(lista.map((x) => entero(x, 'Categoría')))]; // sin repetidos
    await modelos.usuarios.guardarIntereses(req.usuario.idusuario, ids);
    res.json({ categorias: ids });
  });

  router.get('/yo/avisos', soloUsuarios, async (req, res) => res.json(await modelos.moderacion.sancionesDe(req.usuario.idusuario)));

  router.delete('/yo', soloUsuarios, async (req, res) => {
    await modelos.usuarios.desactivar(req.usuario.idusuario);
    if (config.jwtRevocar) await modelos.tokens.revocar(req.jwt.jti, req.usuario.idusuario, req.jwt.exp);
    res.json({ mensaje: 'Tu cuenta fue desactivada' });
  });

  router.get('/:id', async (req, res) => {
    const perfil = await modelos.usuarios.obtenerPublico(entero(req.params.id, 'id'));
    if (!perfil) throw new ErrorHttp(404, 'El perfil no existe');
    res.json(perfil);
  });

  return router;
}

module.exports = { crearRutas };
