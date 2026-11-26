
const express = require('express');
const { ErrorHttp, texto, tituloSeguro, entero, booleano, enumerado } = require('../utilidades');

function crearRutas({ modelos, requiereSesion, requiereRol }) {
  const router = express.Router();
  router.use(requiereSesion, requiereRol('admin'));
  const mod = modelos.moderacion;

  router.get('/resumen', async (req, res) => res.json(await mod.resumen()));

 
  router.get('/reportes', async (req, res) => {
    const estado = enumerado(req.query.estado || 'pendiente', 'estado', ['pendiente', 'desestimado', 'resuelto', 'todos']);
    res.json(await mod.listarReportes(estado === 'todos' ? null : estado, entero(req.query.usuario, 'usuario', { opcional: true })));
  });
  router.patch('/reportes/:id/desestimar', async (req, res) => {
    await mod.cerrarReporte(entero(req.params.id, 'id'), req.usuario.idusuario, 'desestimado');
    res.json({ estado: 'desestimado' });
  });
  router.patch('/reportes/:id/resolver', async (req, res) => {
    await mod.cerrarReporte(entero(req.params.id, 'id'), req.usuario.idusuario, 'resuelto');
    res.json({ estado: 'resuelto' });
  });

  router.get('/usuarios-reportados', async (req, res) => res.json(await mod.usuariosReportados()));

  router.post('/sanciones', async (req, res) => {
    const b = req.body || {};
    const tipo = enumerado(b.tipo, 'El tipo', ['advertencia', 'suspension', 'baneo']);
    await mod.sancionar(req.usuario.idusuario, {
      idusuario: entero(b.idusuario, 'El usuario'),
      idreporte: entero(b.idreporte, 'El reporte', { opcional: true }),
      tipo,
      motivo: texto(b.motivo, 'El motivo', { min: 10, max: 255 }),
      dias: tipo === 'suspension' ? entero(b.dias, 'Los días', { max: 365 }) : null,
    });
    res.status(201).json({ mensaje: 'Sanción aplicada' });
  });
  router.get('/sanciones', async (req, res) => res.json(await mod.listarSanciones()));

  router.patch('/sanciones/:id/revertir', async (req, res) => {
    await mod.revertirSancion(entero(req.params.id, 'id'), req.usuario.idusuario);
    res.json({ mensaje: 'Sanción revertida' });
  });

  router.get('/apelaciones', async (req, res) => {
    res.json(await mod.listarApelaciones(enumerado(req.query.estado || 'pendiente', 'estado', ['pendiente', 'aceptada', 'rechazada'])));
  });
  router.patch('/apelaciones/:id/aceptar', async (req, res) => {
    const respuesta = texto((req.body || {}).respuesta, 'La respuesta', { max: 255, opcional: true });
    await mod.resolverApelacion(entero(req.params.id, 'id'), req.usuario.idusuario, true, respuesta);
    res.json({ estado: 'aceptada' });
  });
  router.patch('/apelaciones/:id/rechazar', async (req, res) => {
    const respuesta = texto((req.body || {}).respuesta, 'La respuesta', { min: 5, max: 255 });
    await mod.resolverApelacion(entero(req.params.id, 'id'), req.usuario.idusuario, false, respuesta);
    res.json({ estado: 'rechazada' });
  });

  
  router.get('/publicaciones', async (req, res) => {
    const q = req.query;
    res.json(await modelos.publicaciones.listarTodas({
      q: typeof q.q === 'string' && q.q.trim() ? q.q.trim().slice(0, 100) : null,
      disponibilidad: enumerado(q.estado, 'estado', ['disponible', 'no_disponible', 'eliminada'], { opcional: true }),
      idcategoria: entero(q.categoria, 'categoria', { opcional: true }),
      pagina: entero(q.pagina, 'pagina', { opcional: true }) || 1,
    }));
  });

 
  function leerCategoria(b) {
    return {
      nombre: tituloSeguro(b.nombre, 'El nombre', { min: 3, max: 100 }),
      descripcion: texto(b.descripcion, 'La descripción', { min: 3, max: 255 }),
      requiere_sellado: booleano(b.requiere_sellado),
      permite_caducidad: b.permite_caducidad === undefined ? true : booleano(b.permite_caducidad),
    };
  }
  router.post('/categorias', async (req, res) => {
    const id = await modelos.catalogos.crearCategoria(leerCategoria(req.body || {}));
    res.status(201).json({ idcategoria: id });
  });
  router.put('/categorias/:id', async (req, res) => {
    await modelos.catalogos.actualizarCategoria(entero(req.params.id, 'id'), leerCategoria(req.body || {}));
    res.json({ mensaje: 'Categoría actualizada' });
  });
  router.delete('/categorias/:id', async (req, res) => {
    await modelos.catalogos.eliminarCategoria(entero(req.params.id, 'id'));
    res.json({ mensaje: 'Categoría eliminada' });
  });

  return router;
}

module.exports = { crearRutas };
