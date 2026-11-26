// Consultas a publicaciones (artículo + publicación en una sola tabla).
// Borrado lógico: eliminar = disponibilidad 'eliminada' (la fila se queda para no romper solicitudes ni reportes).
const config = require('../config');
const { ErrorHttp } = require('../utilidades');

const CONDICIONES = ['nuevo', 'como_nuevo', 'buen_estado', 'con_detalles'];
const MODALIDADES = ['donacion', 'intercambio'];
const DISPONIBILIDADES = ['disponible', 'no_disponible'];

const TARJETA = `p.idpublicacion, p.nombre_articulo, p.foto, p.condicion, p.modalidad, p.caducidad,
  p.disponibilidad, p.fecha_creacion, p.idusuario,
  c.nombre AS categoria, a.nombre AS alcaldia, u.nombre AS dueno_nombre, u.apellido AS dueno_apellido`;
const UNIONES = `FROM publicaciones p
  JOIN categorias c ON c.idcategoria = p.idcategoria
  JOIN alcaldias a ON a.idalcaldia = p.idalcaldia
  JOIN usuarios u ON u.idusuario = p.idusuario`;

function escaparLike(texto) {
  return String(texto).replace(/[\\%_]/g, '\\$&');
}

function paginaValida(valor) {
  const n = Number.parseInt(valor, 10);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

function hoyLocal() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
}

function crearModeloPublicaciones(pool) {
  async function explorar(filtros, idSolicitante) {
    const donde = ["p.disponibilidad = 'disponible'", 'u.activo = true', '(p.caducidad IS NULL OR p.caducidad >= CURRENT_DATE)'];
    const params = [];
    if (filtros.q) {
      donde.push('(p.nombre_articulo ILIKE ? OR p.descripcion ILIKE ?)');
      const patron = `%${escaparLike(filtros.q)}%`;
      params.push(patron, patron);
    }
    if (filtros.idcategoria) { donde.push('p.idcategoria = ?'); params.push(filtros.idcategoria); }
    if (filtros.idalcaldia) { donde.push('p.idalcaldia = ?'); params.push(filtros.idalcaldia); }
    if (filtros.modalidad) { donde.push('p.modalidad = ?'); params.push(filtros.modalidad); }
    if (filtros.condicion) { donde.push('p.condicion = ?'); params.push(filtros.condicion); }
    if (filtros.idusuario) { donde.push('p.idusuario = ?'); params.push(filtros.idusuario); }
    if (filtros.excluirPropias) { donde.push('p.idusuario <> ?'); params.push(idSolicitante); }
    if (filtros.soloIntereses) {
      donde.push('p.idcategoria IN (SELECT idcategoria FROM usuario_categoria WHERE idusuario = ?)');
      params.push(idSolicitante);
    }
    const where = donde.join(' AND ');
    const porPagina = config.publicacionesPorPagina;
    const pagina = paginaValida(filtros.pagina);

    const [[{ total }]] = await pool.query(`SELECT COUNT(*)::int AS total ${UNIONES} WHERE ${where}`, params);
    const [publicaciones] = await pool.query(
      `SELECT ${TARJETA} ${UNIONES} WHERE ${where} ORDER BY p.fecha_creacion DESC LIMIT ? OFFSET ?`,
      [...params, porPagina, (pagina - 1) * porPagina]
    );
    return { publicaciones, total, pagina, porPagina };
  }

  async function listarTodas(filtros) {
    const donde = ['1 = 1'];
    const params = [];
    if (filtros.q) {
      donde.push('(p.nombre_articulo ILIKE ? OR u.nombre ILIKE ? OR u.apellido ILIKE ?)');
      const patron = `%${escaparLike(filtros.q)}%`;
      params.push(patron, patron, patron);
    }
    if (filtros.disponibilidad) { donde.push('p.disponibilidad = ?'); params.push(filtros.disponibilidad); }
    if (filtros.idcategoria) { donde.push('p.idcategoria = ?'); params.push(filtros.idcategoria); }
    const where = donde.join(' AND ');
    const porPagina = 20;
    const pagina = paginaValida(filtros.pagina);
    const [[{ total }]] = await pool.query(`SELECT COUNT(*)::int AS total ${UNIONES} WHERE ${where}`, params);
    const [publicaciones] = await pool.query(
      `SELECT ${TARJETA}, u.activo AS dueno_activo,
        (SELECT COUNT(*)::int FROM reportes r WHERE r.idpublicacion = p.idpublicacion) AS total_reportes
       ${UNIONES} WHERE ${where} ORDER BY p.fecha_creacion DESC LIMIT ? OFFSET ?`,
      [...params, porPagina, (pagina - 1) * porPagina]
    );
    return { publicaciones, total, pagina, porPagina };
  }

  async function listarPropias(idusuario) {
    const [f] = await pool.query(
      `SELECT ${TARJETA} ${UNIONES} WHERE p.idusuario = ? AND p.disponibilidad <> 'eliminada' ORDER BY p.fecha_creacion DESC`,
      [idusuario]
    );
    return f;
  }

  async function ofrecibles(idusuario) {
    const [f] = await pool.query(
      `SELECT idpublicacion, nombre_articulo FROM publicaciones
       WHERE idusuario = ? AND disponibilidad = 'disponible' AND modalidad = 'intercambio' ORDER BY nombre_articulo`,
      [idusuario]
    );
    return f;
  }

  
  async function obtener(idpublicacion) {
    const [f] = await pool.query(
      `SELECT p.*, c.nombre AS categoria, c.requiere_sellado, a.nombre AS alcaldia,
        u.nombre AS dueno_nombre, u.apellido AS dueno_apellido, u.foto_perfil AS dueno_foto, u.activo AS dueno_activo,
        r.puntos_confianza AS dueno_puntos, r.total_calificaciones AS dueno_calificaciones
       ${UNIONES}
       LEFT JOIN vista_reputacion r ON r.idusuario = u.idusuario
       WHERE p.idpublicacion = ?`,
      [idpublicacion]
    );
    return f[0] || null;
  }

  async function validar({ idcategoria, condicion, modalidad, caducidad }) {
    if (!CONDICIONES.includes(condicion)) throw new ErrorHttp(400, 'Condición no válida');
    if (!MODALIDADES.includes(modalidad)) throw new ErrorHttp(400, 'Modalidad no válida');
    const [cat] = await pool.query('SELECT requiere_sellado, permite_caducidad FROM categorias WHERE idcategoria = ?', [idcategoria]);
    if (cat.length === 0) throw new ErrorHttp(400, 'La categoría no existe');
    // Ropa, accesorios y apoyos: la caducidad no aplica y se bloquea por completo.
    if (!cat[0].permite_caducidad && caducidad) throw new ErrorHttp(400, 'Esta categoría no maneja fecha de caducidad');
    if (cat[0].requiere_sellado) {
      if (condicion !== 'nuevo') throw new ErrorHttp(400, 'Esta categoría solo acepta artículos nuevos y sellados');
      if (!caducidad) throw new ErrorHttp(400, 'Esta categoría exige fecha de caducidad');
    }
    if (caducidad) {
      if (String(caducidad).slice(0, 10) < hoyLocal()) throw new ErrorHttp(400, 'La fecha de caducidad ya pasó');
    }
  }

  async function crear(idusuario, d) {
    const [r] = await pool.query(
      `INSERT INTO publicaciones (idusuario, idcategoria, idalcaldia, nombre_articulo, descripcion, foto, condicion, modalidad, caducidad)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [idusuario, d.idcategoria, d.idalcaldia, d.nombre_articulo, d.descripcion, d.foto, d.condicion, d.modalidad, d.caducidad]
    );
    return r.insertId;
  }

 
  async function actualizar(idpublicacion, d) {
    const [r] = await pool.query(
      `UPDATE publicaciones SET idcategoria = ?, idalcaldia = ?, nombre_articulo = ?, descripcion = ?,
        foto = COALESCE(?, foto), condicion = ?, modalidad = ?, caducidad = ?
       WHERE idpublicacion = ? AND disponibilidad <> 'eliminada'`,
      [d.idcategoria, d.idalcaldia, d.nombre_articulo, d.descripcion, d.foto, d.condicion, d.modalidad, d.caducidad, idpublicacion]
    );
    if (r.affectedRows === 0) throw new ErrorHttp(404, 'La publicación no existe');
  }


  async function cambiarDisponibilidad(idpublicacion, disponibilidad) {
    if (!DISPONIBILIDADES.includes(disponibilidad)) throw new ErrorHttp(400, 'Disponibilidad no válida');
    const [r] = await pool.query(
      "UPDATE publicaciones SET disponibilidad = ? WHERE idpublicacion = ? AND disponibilidad <> 'eliminada'",
      [disponibilidad, idpublicacion]
    );
    if (r.affectedRows === 0) throw new ErrorHttp(404, 'La publicación no existe');
  }

 
  async function eliminar(idpublicacion) {
    const conexion = await pool.getConnection();
    try {
      await conexion.beginTransaction();
      await conexion.query("UPDATE publicaciones SET disponibilidad = 'eliminada' WHERE idpublicacion = ?", [idpublicacion]);
      await conexion.query(
        `UPDATE solicitudes SET estado = 'rechazada'
         WHERE (idpublicacion = ? OR idpublicacion_ofrecida = ?) AND estado IN ('pendiente','aceptada')`,
        [idpublicacion, idpublicacion]
      );
      await conexion.commit();
    } catch (error) {
      await conexion.rollback();
      throw error;
    } finally {
      conexion.release();
    }
  }

  return { explorar, listarTodas, listarPropias, ofrecibles, obtener, validar, crear, actualizar, cambiarDisponibilidad, eliminar };
}

module.exports = { crearModeloPublicaciones, CONDICIONES, MODALIDADES };
