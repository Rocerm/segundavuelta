// Mensajes del chat. Cada mensaje pertenece a una solicitud (el chat es entre dueño y solicitante).
const { texto, ErrorHttp } = require('../utilidades');

function crearModeloMensajes(pool) {
  // Historial de la solicitud. 'despuesDe' sirve para pedir solo los mensajes nuevos.
  async function listar(idsolicitud, despuesDe = 0) {
    const desde = Number.parseInt(despuesDe, 10) || 0;
    const [f] = await pool.query(
      `SELECT m.idmensaje, m.idsolicitud, m.idremitente, m.contenido, m.fecha_envio, u.nombre AS remitente_nombre
       FROM mensajes m JOIN usuarios u ON u.idusuario = m.idremitente
       WHERE m.idsolicitud = ? AND m.idmensaje > ? ORDER BY m.idmensaje`,
      [idsolicitud, desde]
    );
    return f;
  }

  // Guarda un mensaje y lo regresa completo (para difundirlo por el WebSocket).
  async function crear(idsolicitud, idremitente, contenido) {
    // Solo el dueño y el solicitante pueden escribir en el chat de la solicitud.
    const [sol] = await pool.query(
      `SELECT s.idsolicitante, p.idusuario AS iddueno
       FROM solicitudes s JOIN publicaciones p ON p.idpublicacion = s.idpublicacion WHERE s.idsolicitud = ?`,
      [idsolicitud]
    );
    if (sol.length === 0) throw new ErrorHttp(404, 'La solicitud no existe');
    if (idremitente !== sol[0].idsolicitante && idremitente !== sol[0].iddueno) {
      throw new ErrorHttp(403, 'No participas en esta solicitud');
    }

    // Se limpia, se valida el largo y se rechazan patrones de inyección.
    const limpio = texto(contenido, 'El mensaje', { min: 1, max: 1000 });
    const [r] = await pool.query('INSERT INTO mensajes (idsolicitud, idremitente, contenido) VALUES (?, ?, ?)', [idsolicitud, idremitente, limpio]);
    const [f] = await pool.query(
      `SELECT m.idmensaje, m.idsolicitud, m.idremitente, m.contenido, m.fecha_envio, u.nombre AS remitente_nombre
       FROM mensajes m JOIN usuarios u ON u.idusuario = m.idremitente WHERE m.idmensaje = ?`,
      [r.insertId]
    );
    return f[0];
  }

  return { listar, crear };
}

module.exports = { crearModeloMensajes };
