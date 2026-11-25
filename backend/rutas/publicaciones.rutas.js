// /api/publicaciones → explorar, ver, crear, editar, cambiar disponibilidad y eliminar.
const express = require('express');
const { ErrorHttp, texto, tituloSeguro, entero, enumerado, fecha } = require('../utilidades');
const { CONDICIONES, MODALIDADES } = require('../modelos/publicaciones.modelo');
const { rutaPublica, borrarArchivo } = require('../middlewares/upload.middleware');

function crearRutas({ modelos, requiereSesion, soloUsuarios, subirFotoPublicacion }) {
  const router = express.Router();
  router.use(requiereSesion);
  const pubs = modelos.publicaciones;

  // Lee y valida los campos del formulario (sirve para crear y para editar).
  async function leerFormulario(req) {
    const b = req.body || {};
    const datos = {
      nombre_articulo: tituloSeguro(b.nombre_articulo, 'El nombre del artículo', { min: 3, max: 100 }),
      descripcion: texto(b.descripcion, 'La descripción', { min: 10, max: 2000, multilinea: true }),
      idcategoria: entero(b.idcategoria, 'La categoría'),
      // Zona de entrega: si no la mandan, se usa la alcaldía del usuario.
      idalcaldia: entero(b.idalcaldia || req.usuario.idalcaldia, 'La alcaldía'),
      condicion: enumerado(b.condicion, 'La condición', CONDICIONES),
      modalidad: enumerado(b.modalidad, 'La modalidad', MODALIDADES),
      caducidad: fecha(b.caducidad, 'La caducidad', { opcional: true }),
    };
    await pubs.validar(datos); // regla de categorías "sellado" + enums
    return datos;
  }

  // GET /api/publicaciones?q=&categoria=&alcaldia=&modalidad=&condicion=&usuario=&intereses=1&excluirPropias=1&pagina=1
  router.get('/', async (req, res) => {
    const q = req.query;
    res.json(await pubs.explorar({
      q: typeof q.q === 'string' && q.q.trim() ? q.q.trim().slice(0, 100) : null,
      idcategoria: entero(q.categoria, 'categoria', { opcional: true }),
      idalcaldia: entero(q.alcaldia, 'alcaldia', { opcional: true }),
      modalidad: enumerado(q.modalidad, 'modalidad', MODALIDADES, { opcional: true }),
      condicion: enumerado(q.condicion, 'condicion', CONDICIONES, { opcional: true }),
      idusuario: entero(q.usuario, 'usuario', { opcional: true }),
      soloIntereses: q.intereses === '1',
      excluirPropias: q.excluirPropias === '1',
      pagina: entero(q.pagina, 'pagina', { opcional: true }) || 1,
    }, req.usuario.idusuario));
  });

  // GET /api/publicaciones/mias → todas las mías (para administrarlas)
  router.get('/mias', soloUsuarios, async (req, res) => res.json(await pubs.listarPropias(req.usuario.idusuario)));

  // GET /api/publicaciones/ofrecibles → las mías que puedo ofrecer en un intercambio
  router.get('/ofrecibles', soloUsuarios, async (req, res) => res.json(await pubs.ofrecibles(req.usuario.idusuario)));

  // GET /api/publicaciones/:id
  router.get('/:id', async (req, res) => {
    const p = await pubs.obtener(entero(req.params.id, 'id'));
    const esDueno = p && p.idusuario === req.usuario.idusuario;
    const esAdmin = req.usuario.rol === 'admin';
    // Las eliminadas y las de cuentas inactivas solo las ve su dueño o un admin.
    if (!p || ((p.disponibilidad === 'eliminada' || !p.dueno_activo) && !esDueno && !esAdmin)) {
      throw new ErrorHttp(404, 'La publicación no existe');
    }
    res.json(p);
  });

  // POST /api/publicaciones (multipart: campos del formulario + "foto" obligatoria)
  router.post('/', soloUsuarios, subirFotoPublicacion, async (req, res) => {
    try {
      if (!req.file) throw new ErrorHttp(400, 'La foto es obligatoria');
      const datos = await leerFormulario(req);
      datos.foto = await rutaPublica('publicaciones', req.file);
      const id = await pubs.crear(req.usuario.idusuario, datos);
      res.status(201).json({ idpublicacion: id });
    } catch (error) {
      if (req.file) borrarArchivo(rutaPublica('publicaciones', req.file)); // si algo falló, no dejar la foto huérfana
      throw error;
    }
  });

  // PUT /api/publicaciones/:id (solo el dueño; la foto es opcional al editar)
  router.put('/:id', soloUsuarios, subirFotoPublicacion, async (req, res) => {
    try {
      const id = entero(req.params.id, 'id');
      const actual = await pubs.obtener(id);
      if (!actual || actual.disponibilidad === 'eliminada') throw new ErrorHttp(404, 'La publicación no existe');
      if (actual.idusuario !== req.usuario.idusuario) throw new ErrorHttp(403, 'Solo el dueño puede editarla');
      const datos = await leerFormulario(req);
      datos.foto = req.file ? rutaPublica('publicaciones', req.file) : null;
      await pubs.actualizar(id, datos);
      if (req.file) borrarArchivo(actual.foto); // se borra la foto anterior
      res.json({ idpublicacion: id });
    } catch (error) {
      if (req.file) borrarArchivo(rutaPublica('publicaciones', req.file));
      throw error;
    }
  });

  // PATCH /api/publicaciones/:id/disponibilidad  { disponibilidad: 'disponible' | 'no_disponible' }
  router.patch('/:id/disponibilidad', soloUsuarios, async (req, res) => {
    const id = entero(req.params.id, 'id');
    const valor = req.body && req.body.disponibilidad;
    if (!['disponible', 'no_disponible'].includes(valor)) throw new ErrorHttp(400, 'Disponibilidad no válida');
    const p = await pubs.obtener(id);
    if (!p || p.disponibilidad === 'eliminada') throw new ErrorHttp(404, 'La publicación no existe');
    if (p.idusuario !== req.usuario.idusuario) throw new ErrorHttp(403, 'Solo el dueño puede cambiarla');
    await pubs.cambiarDisponibilidad(id, valor);
    res.json({ disponibilidad: valor });
  });

  // DELETE /api/publicaciones/:id → borrado lógico. Lo puede hacer el dueño o un admin (moderación).
  router.delete('/:id', async (req, res) => {
    const id = entero(req.params.id, 'id');
    const p = await pubs.obtener(id);
    if (!p || p.disponibilidad === 'eliminada') throw new ErrorHttp(404, 'La publicación no existe');
    if (p.idusuario !== req.usuario.idusuario && req.usuario.rol !== 'admin') throw new ErrorHttp(403, 'No puedes eliminarla');
    await pubs.eliminar(id);
    res.json({ mensaje: 'Publicación eliminada' });
  });

  return router;
}

module.exports = { crearRutas };
