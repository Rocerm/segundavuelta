const { ErrorHttp } = require('../utilidades');

const DETALLE = `SELECT s.*, p.nombre_articulo AS pub_nombre, p.foto AS pub_foto, p.modalidad AS pub_modalidad, p.disponibilidad AS pub_disponibilidad,
    p.idusuario AS iddueno, d.nombre AS dueno_nombre, d.apellido AS dueno_apellido,
    d.foto_perfil AS dueno_foto, rd.puntos_confianza AS dueno_puntos,
    t.nombre AS solicitante_nombre, t.apellido AS solicitante_apellido,
    t.foto_perfil AS solicitante_foto, rt.puntos_confianza AS solicitante_puntos,
    p.caducidad AS pub_caducidad, p.condicion AS pub_condicion,
    o.nombre_articulo AS ofrecida_nombre, o.foto AS ofrecida_foto
  FROM solicitudes s
  JOIN publicaciones p ON p.idpublicacion = s.idpublicacion
  JOIN usuarios d ON d.idusuario = p.idusuario
  JOIN usuarios t ON t.idusuario = s.idsolicitante
  LEFT JOIN vista_reputacion rd ON rd.idusuario = d.idusuario
  LEFT JOIN vista_reputacion rt ON rt.idusuario = t.idusuario
  LEFT JOIN publicaciones o ON o.idpublicacion = s.idpublicacion_ofrecida`;

const PERMITIDO = {
  aceptada: ['pendiente'],
  rechazada: ['pendiente', 'aceptada'],
  completada: ['aceptada'],
};

function crearModeloSolicitudes(pool) {
  async function obtener(idsolicitud) {
    const [f] = await pool.query(`${DETALLE} WHERE s.idsolicitud = ?`, [idsolicitud]);
    return f[0] || null;
  }

  function esParticipante(solicitud, idusuario) {
    return solicitud.iddueno === idusuario || solicitud.idsolicitante === idusuario;
  }

  async function crear(idsolicitante, { idpublicacion, mensaje, idpublicacion_ofrecida }) {
    // 'vencida' se calcula en SQL para comparar contra la fecha de la BD y no depender de cómo llegue el tipo date.
    const [pubs] = await pool.query(
      `SELECT p.idusuario, p.modalidad, p.disponibilidad, u.activo,
        (p.caducidad IS NOT NULL AND p.caducidad < CURRENT_DATE) AS vencida
       FROM publicaciones p JOIN usuarios u ON u.idusuario = p.idusuario WHERE p.idpublicacion = ?`,
      [idpublicacion]
    );
    const pub = pubs[0];
    if (!pub || pub.disponibilidad === 'eliminada' || !pub.activo) throw new ErrorHttp(404, 'La publicación no existe');
    if (pub.disponibilidad !== 'disponible') throw new ErrorHttp(409, 'La publicación ya no está disponible');
    if (pub.vencida) throw new ErrorHttp(409, 'La publicación ya caducó');
    if (pub.idusuario === idsolicitante) throw new ErrorHttp(400, 'No puedes pedir tu propia publicación');

    let ofrecida = null;
    if (pub.modalidad === 'intercambio') {
      // En un intercambio hay que ofrecer una publicación propia, disponible y de modalidad intercambio.
      if (!idpublicacion_ofrecida) throw new ErrorHttp(400, 'Para un intercambio debes ofrecer una de tus publicaciones');
      const [mias] = await pool.query(
        "SELECT 1 FROM publicaciones WHERE idpublicacion = ? AND idusuario = ? AND disponibilidad = 'disponible' AND modalidad = 'intercambio'",
        [idpublicacion_ofrecida, idsolicitante]
      );
      if (mias.length === 0) throw new ErrorHttp(400, 'Lo que ofreces debe ser una publicación tuya, disponible y de intercambio');
      ofrecida = idpublicacion_ofrecida;
    }

    try {
      const [r] = await pool.query(
        'INSERT INTO solicitudes (idpublicacion, idsolicitante, idpublicacion_ofrecida, mensaje) VALUES (?, ?, ?, ?)',
        [idpublicacion, idsolicitante, ofrecida, mensaje]
      );
      return r.insertId;
    } catch (error) {
      // uq_solicitud: solo una solicitud por persona y publicación.
      if (error.code === '23505') throw new ErrorHttp(409, 'Ya enviaste una solicitud para esta publicación');
      throw error;
    }
  }

  async function enviadas(idusuario) {
    const [f] = await pool.query(`${DETALLE} WHERE s.idsolicitante = ? ORDER BY s.fecha_solicitud DESC`, [idusuario]);
    return f;
  }

  async function recibidas(idusuario, idpublicacion) {
    const [f] = idpublicacion
      ? await pool.query(`${DETALLE} WHERE p.idusuario = ? AND s.idpublicacion = ? ORDER BY s.fecha_solicitud DESC`, [idusuario, idpublicacion])
      : await pool.query(`${DETALLE} WHERE p.idusuario = ? ORDER BY s.fecha_solicitud DESC`, [idusuario]);
    return f;
  }

  async function cambiarEstado(idsolicitud, idusuario, nuevo) {
    if (!Object.prototype.hasOwnProperty.call(PERMITIDO, nuevo)) throw new ErrorHttp(400, 'Estado no válido');

    const sol = await obtener(idsolicitud);
    if (!sol) throw new ErrorHttp(404, 'La solicitud no existe');
    if (sol.iddueno !== idusuario) throw new ErrorHttp(403, 'Solo el dueño de la publicación puede hacer esto');

    if (!PERMITIDO[nuevo].includes(sol.estado)) {
      throw new ErrorHttp(409, `No se puede pasar de "${sol.estado}" a "${nuevo}"`);
    }
    if (nuevo === 'aceptada' && sol.pub_disponibilidad !== 'disponible') {
      throw new ErrorHttp(409, 'La publicación ya no está disponible');
    }

    if (nuevo !== 'completada') {
      const [r] = await pool.query(
        'UPDATE solicitudes SET estado = ? WHERE idsolicitud = ? AND estado = ?',
        [nuevo, idsolicitud, sol.estado]
      );
      if (r.affectedRows === 0) throw new ErrorHttp(409, 'La solicitud cambió de estado, vuelve a intentarlo');
      return;
    }

    const conexion = await pool.getConnection();
    try {
      await conexion.beginTransaction();
      // Se bloquea la fila y se revisa de nuevo el estado, por si dos peticiones llegaron a la vez.
      const [bloqueada] = await conexion.query('SELECT estado FROM solicitudes WHERE idsolicitud = ? FOR UPDATE', [idsolicitud]);
      if (bloqueada.length === 0 || bloqueada[0].estado !== 'aceptada') {
        throw new ErrorHttp(409, 'La solicitud ya no está aceptada');
      }
      await conexion.query("UPDATE solicitudes SET estado = 'completada', fecha_completada = NOW() WHERE idsolicitud = ?", [idsolicitud]);
      // El artículo entregado ya no está disponible...
      await conexion.query("UPDATE publicaciones SET disponibilidad = 'no_disponible' WHERE idpublicacion = ?", [sol.idpublicacion]);
      // ...y en un intercambio, el que se recibió a cambio tampoco.
      if (sol.idpublicacion_ofrecida) {
        await conexion.query("UPDATE publicaciones SET disponibilidad = 'no_disponible' WHERE idpublicacion = ?", [sol.idpublicacion_ofrecida]);
      }
      const ids = [sol.idpublicacion, sol.idpublicacion_ofrecida].filter(Boolean);
      const marcas = ids.map(() => '?').join(', ');
      await conexion.query(
        `UPDATE solicitudes SET estado = 'rechazada'
         WHERE idsolicitud <> ? AND estado IN ('pendiente','aceptada')
           AND (idpublicacion IN (${marcas}) OR idpublicacion_ofrecida IN (${marcas}))`,
        [idsolicitud, ...ids, ...ids]
      );
      await conexion.commit();
    } catch (error) {
      await conexion.rollback();
      throw error;
    } finally {
      conexion.release();
    }
  }

  return { obtener, esParticipante, crear, enviadas, recibidas, cambiarEstado };
}

module.exports = { crearModeloSolicitudes };
