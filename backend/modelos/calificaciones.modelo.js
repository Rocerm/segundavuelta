// Calificaciones: después de una solicitud COMPLETADA, ambos se califican (criterios de 0 a 5).
// Los puntos de confianza (0 a 10) los calcula la vista vista_reputacion.
const { ErrorHttp } = require('../utilidades');

// Convierte a número y comprueba que sea un entero de 0 a 5.
function entero0a5(valor, nombre) {
  if (valor === null || valor === undefined || valor === '') throw new ErrorHttp(400, `${nombre} es obligatoria`);
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 0 || n > 5) throw new ErrorHttp(400, `${nombre} debe ser un entero de 0 a 5`);
  return n;
}

function crearModeloCalificaciones(pool) {
 
  async function pendientes(idusuario) {
    const [f] = await pool.query(
      `SELECT v.idsolicitud, v.idevaluado, u.nombre AS evaluado_nombre, u.apellido AS evaluado_apellido,
        p.nombre_articulo, p.modalidad,
        NOT (v.idevaluador = p.idusuario AND p.modalidad = 'donacion') AS pide_veracidad
       FROM vista_calificaciones_pendientes v
       JOIN solicitudes s ON s.idsolicitud = v.idsolicitud
       JOIN publicaciones p ON p.idpublicacion = s.idpublicacion
       JOIN usuarios u ON u.idusuario = v.idevaluado
       WHERE v.idevaluador = ? ORDER BY v.idsolicitud DESC`,
      [idusuario]
    );
    return f;
  }

  async function crear(idevaluador, { idsolicitud, puntualidad, actitud, veracidad, comentario }) {
    const [filas] = await pool.query(
      `SELECT s.estado, s.idsolicitante, p.idusuario AS iddueno, p.modalidad
       FROM solicitudes s JOIN publicaciones p ON p.idpublicacion = s.idpublicacion WHERE s.idsolicitud = ?`,
      [idsolicitud]
    );
    const sol = filas[0];
    if (!sol) throw new ErrorHttp(404, 'La solicitud no existe');
    if (sol.estado !== 'completada') throw new ErrorHttp(409, 'Solo se califica cuando la entrega ya se completó');

   
    let idevaluado;
    if (idevaluador === sol.iddueno) idevaluado = sol.idsolicitante;
    else if (idevaluador === sol.idsolicitante) idevaluado = sol.iddueno;
    else throw new ErrorHttp(403, 'No participaste en esta solicitud');

   
    const sinVeracidad = idevaluador === sol.iddueno && sol.modalidad === 'donacion';
    const veracidadVacia = veracidad === null || veracidad === undefined || veracidad === '';
    if (sinVeracidad && !veracidadVacia) throw new ErrorHttp(400, 'En una donación el dueño no califica la veracidad');
    if (!sinVeracidad && veracidadVacia) throw new ErrorHttp(400, 'La veracidad es obligatoria');

    const p = entero0a5(puntualidad, 'La puntualidad');
    const a = entero0a5(actitud, 'La actitud');
    const v = sinVeracidad ? null : entero0a5(veracidad, 'La veracidad');

    try {
      await pool.query(
        `INSERT INTO calificaciones (idsolicitud, idevaluador, idevaluado, puntualidad, actitud, veracidad, comentario)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [idsolicitud, idevaluador, idevaluado, p, a, v, comentario ?? null]
      );
    } catch (error) {
      if (error.code === '23505') throw new ErrorHttp(409, 'Ya calificaste esta entrega');
      throw error;
    }
  }

  async function recibidas(idevaluado) {
    const [f] = await pool.query(
      `SELECT c.idcalificacion, c.puntualidad, c.actitud, c.veracidad, c.comentario, c.fecha,
        u.nombre AS evaluador_nombre, u.apellido AS evaluador_apellido
       FROM calificaciones c JOIN usuarios u ON u.idusuario = c.idevaluador
       WHERE c.idevaluado = ? ORDER BY c.fecha DESC LIMIT 50`,
      [idevaluado]
    );
    return f;
  }

  return { pendientes, crear, recibidas };
}

module.exports = { crearModeloCalificaciones };
