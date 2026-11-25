// Listas que llenan los selects: alcaldías, categorías y motivos de reporte.
// Las categorías las administra el admin (crear, editar y eliminar si nadie las usa).
const { ErrorHttp } = require('../utilidades');

function crearModeloCatalogos(pool) {
  async function alcaldias() {
    const [f] = await pool.query('SELECT idalcaldia, nombre FROM alcaldias ORDER BY nombre');
    return f;
  }

  // Cada categoría trae sus dos reglas: requiere_sellado (nuevo + caducidad obligatoria) y permite_caducidad (si el campo existe).
  async function categorias() {
    const [f] = await pool.query(
      `SELECT c.idcategoria, c.nombre, c.descripcion, c.requiere_sellado, c.permite_caducidad,
        (SELECT COUNT(*)::int FROM publicaciones p WHERE p.idcategoria = c.idcategoria AND p.disponibilidad <> 'eliminada') AS total_publicaciones
       FROM categorias c ORDER BY c.idcategoria`
    );
    return f;
  }

  // tipo: 'publicacion' | 'perfil' (opcional)
  async function motivos(tipo) {
    const [f] = tipo
      ? await pool.query('SELECT idmotivo, nombre, tipo, descripcion FROM motivos_reporte WHERE tipo = ? ORDER BY idmotivo', [tipo])
      : await pool.query('SELECT idmotivo, nombre, tipo, descripcion FROM motivos_reporte ORDER BY tipo, idmotivo');
    return f;
  }

  // Un sellado siempre admite caducidad (la BD también lo exige con un CHECK).
  function revisarReglas({ requiere_sellado, permite_caducidad }) {
    if (requiere_sellado && !permite_caducidad) {
      throw new ErrorHttp(400, 'Una categoría de productos sellados tiene que admitir fecha de caducidad');
    }
  }

  async function crearCategoria(d) {
    revisarReglas(d);
    try {
      const [r] = await pool.query(
        'INSERT INTO categorias (nombre, descripcion, requiere_sellado, permite_caducidad) VALUES (?, ?, ?, ?)',
        [d.nombre, d.descripcion, d.requiere_sellado, d.permite_caducidad]
      );
      return r.insertId;
    } catch (error) {
      if (error.code === '23505') throw new ErrorHttp(409, 'Ya existe una categoría con ese nombre');
      throw error;
    }
  }

  async function actualizarCategoria(id, d) {
    revisarReglas(d);
    try {
      const [r] = await pool.query(
        'UPDATE categorias SET nombre = ?, descripcion = ?, requiere_sellado = ?, permite_caducidad = ? WHERE idcategoria = ?',
        [d.nombre, d.descripcion, d.requiere_sellado, d.permite_caducidad, id]
      );
      if (r.affectedRows === 0) throw new ErrorHttp(404, 'La categoría no existe');
    } catch (error) {
      if (error.code === '23505') throw new ErrorHttp(409, 'Ya existe una categoría con ese nombre');
      throw error;
    }
  }

  // Solo se elimina si ninguna publicación (ni siquiera eliminada) la usa; si no, se rompería el historial.
  async function eliminarCategoria(id) {
    const [[{ usos }]] = await pool.query('SELECT COUNT(*)::int AS usos FROM publicaciones WHERE idcategoria = ?', [id]);
    if (usos > 0) throw new ErrorHttp(409, 'No se puede eliminar: ya hay publicaciones con esa categoría. Mejor edítala.');
    try {
      const [r] = await pool.query('DELETE FROM categorias WHERE idcategoria = ?', [id]);
      if (r.affectedRows === 0) throw new ErrorHttp(404, 'La categoría no existe');
    } catch (error) {
      // Llave foránea: alguien publicó (o eligió la categoría como interés) entre el conteo y el borrado.
      if (error.code === '23503') throw new ErrorHttp(409, 'No se puede eliminar: la categoría ya está en uso');
      throw error;
    }
  }

  return { alcaldias, categorias, motivos, crearCategoria, actualizarCategoria, eliminarCategoria };
}

module.exports = { crearModeloCatalogos };
