// Moderación: reportes, sanciones, apelaciones y motivos_reporte.
// Un reporte es de una publicación O de un perfil (la BD exige exactamente uno de los dos).
const { ErrorHttp } = require('../utilidades');

// Estado calculado de una sanción (no se guarda: se deduce de las fechas).
//   revertida  → un admin la quitó (o se aprobó una apelación)
//   finalizada → era una suspensión y ya pasó su fecha_fin
//   vigente    → sigue surtiendo efecto (un baneo, una suspensión en curso, o una advertencia)
const ESTADO_SANCION = `CASE WHEN s.fecha_revertida IS NOT NULL THEN 'revertida'
  WHEN s.tipo = 'suspension' AND s.fecha_fin <= NOW() THEN 'finalizada' ELSE 'vigente' END`;

const TIPOS_SANCION = ['advertencia', 'suspension', 'baneo'];

function crearModeloModeracion(pool) {
  // ---------------------------------------------------------------- REPORTES
  // Crea el reporte. Que el motivo coincida con el tipo lo valida esta función (la BD no puede).
  async function crearReporte(idreportante, { idpublicacion, idusuario_reportado, idmotivo, comentario }) {
    if (!!idpublicacion === !!idusuario_reportado) throw new ErrorHttp(400, 'Reporta una publicación o un perfil, no ambos');
    const tipo = idpublicacion ? 'publicacion' : 'perfil';

    const [mot] = await pool.query('SELECT tipo FROM motivos_reporte WHERE idmotivo = ?', [idmotivo]);
    if (mot.length === 0) throw new ErrorHttp(400, 'El motivo no existe');
    if (mot[0].tipo !== tipo) throw new ErrorHttp(400, `Ese motivo no aplica a un reporte de ${tipo}`);

    if (idpublicacion) {
      const [p] = await pool.query('SELECT idusuario FROM publicaciones WHERE idpublicacion = ?', [idpublicacion]);
      if (p.length === 0) throw new ErrorHttp(404, 'La publicación no existe');
      if (p[0].idusuario === idreportante) throw new ErrorHttp(400, 'No puedes reportar tu propia publicación');
    } else {
      if (idusuario_reportado === idreportante) throw new ErrorHttp(400, 'No puedes reportarte a ti mismo');
      const [u] = await pool.query('SELECT rol FROM usuarios WHERE idusuario = ?', [idusuario_reportado]);
      if (u.length === 0) throw new ErrorHttp(404, 'El usuario no existe');
      if (u[0].rol === 'admin') throw new ErrorHttp(400, 'No se puede reportar a un administrador');
    }

    // Evita reportes repetidos mientras el anterior siga pendiente.
    const [dup] = await pool.query(
      `SELECT 1 FROM reportes WHERE idreportante = ? AND estado = 'pendiente'
       AND idpublicacion IS NOT DISTINCT FROM ? AND idusuario_reportado IS NOT DISTINCT FROM ?`,
      [idreportante, idpublicacion || null, idusuario_reportado || null]
    );
    if (dup.length > 0) throw new ErrorHttp(409, 'Ya tienes un reporte pendiente sobre esto');

    try {
      const [r] = await pool.query(
        'INSERT INTO reportes (idreportante, idpublicacion, idusuario_reportado, idmotivo, comentario) VALUES (?, ?, ?, ?, ?)',
        [idreportante, idpublicacion || null, idusuario_reportado || null, idmotivo, comentario]
      );
      return r.insertId;
    } catch (error) {
      // Si existe un índice único parcial sobre los reportes pendientes, esto cubre las peticiones simultáneas.
      if (error.code === '23505') throw new ErrorHttp(409, 'Ya tienes un reporte pendiente sobre esto');
      throw error;
    }
  }

  // Lista para el admin. idobjetivo = la persona a la que se le podría aplicar una sanción
  // (el dueño de la publicación reportada o el perfil reportado).
  // estado: 'pendiente' | 'desestimado' | 'resuelto' | null (todos). idusuario: solo los reportes de esa persona.
  async function listarReportes(estado, idusuario) {
    const donde = ['1 = 1'];
    const params = [];
    if (estado) { donde.push('r.estado = ?'); params.push(estado); }
    if (idusuario) { donde.push('COALESCE(r.idusuario_reportado, p.idusuario) = ?'); params.push(idusuario); }
    const [f] = await pool.query(
      `SELECT r.idreporte, r.estado, r.comentario, r.fecha, r.idpublicacion, r.idusuario_reportado,
        m.nombre AS motivo, m.tipo,
        rp.nombre AS reportante_nombre, rp.apellido AS reportante_apellido,
        p.nombre_articulo, p.disponibilidad AS pub_disponibilidad,
        COALESCE(r.idusuario_reportado, p.idusuario) AS idobjetivo,
        o.nombre AS objetivo_nombre, o.apellido AS objetivo_apellido
       FROM reportes r
       JOIN motivos_reporte m ON m.idmotivo = r.idmotivo
       JOIN usuarios rp ON rp.idusuario = r.idreportante
       LEFT JOIN publicaciones p ON p.idpublicacion = r.idpublicacion
       JOIN usuarios o ON o.idusuario = COALESCE(r.idusuario_reportado, p.idusuario)
       WHERE ${donde.join(' AND ')} ORDER BY r.fecha DESC LIMIT 100`,
      params
    );
    return f;
  }

  // Quiénes han sido reportados y cuántas veces (para decidir a quién revisar primero).
  async function usuariosReportados() {
    const [f] = await pool.query(
      `SELECT o.idusuario, o.nombre, o.apellido, o.correo, o.activo,
        COUNT(*) AS total_reportes,
        COUNT(*) FILTER (WHERE r.estado = 'pendiente') AS pendientes,
        (SELECT COUNT(*) FROM sanciones s WHERE s.idusuario = o.idusuario) AS total_sanciones
       FROM reportes r
       LEFT JOIN publicaciones p ON p.idpublicacion = r.idpublicacion
       JOIN usuarios o ON o.idusuario = COALESCE(r.idusuario_reportado, p.idusuario)
       GROUP BY o.idusuario, o.nombre, o.apellido, o.correo, o.activo
       ORDER BY pendientes DESC, total_reportes DESC LIMIT 100`
    );
    return f;
  }

  // Cierra un reporte: 'desestimado' (no procede) o 'resuelto' (se atendió).
  async function cerrarReporte(idreporte, idadmin, estado) {
    if (!['desestimado', 'resuelto'].includes(estado)) throw new ErrorHttp(400, 'Estado inválido');
    const [r] = await pool.query(
      "UPDATE reportes SET estado = ?, idadmin = ? WHERE idreporte = ? AND estado = 'pendiente'",
      [estado, idadmin, idreporte]
    );
    if (r.affectedRows === 0) throw new ErrorHttp(409, 'El reporte no existe o ya fue atendido');
  }

  // ---------------------------------------------------------------- SANCIONES
  // Crea una sanción. Baneo = la cuenta se desactiva. Suspensión = fecha_fin dentro de N días.
  // Si viene idreporte, ese reporte queda resuelto en la misma transacción.
  async function sancionar(idadmin, { idusuario, idreporte, tipo, motivo, dias }) {
    if (!TIPOS_SANCION.includes(tipo)) throw new ErrorHttp(400, 'Tipo de sanción inválido');
    if (tipo === 'suspension') {
      dias = Number(dias);
      if (!Number.isInteger(dias) || dias <= 0) throw new ErrorHttp(400, 'La suspensión requiere un número de días entero y mayor a 0');
    }

    const [u] = await pool.query('SELECT rol FROM usuarios WHERE idusuario = ?', [idusuario]);
    if (u.length === 0) throw new ErrorHttp(404, 'El usuario no existe');
    if (u[0].rol === 'admin') throw new ErrorHttp(400, 'No se puede sancionar a un administrador');

    // Si se ata a un reporte, debe estar pendiente y ser sobre esa misma persona.
    if (idreporte) {
      const [rep] = await pool.query(
        `SELECT COALESCE(r.idusuario_reportado, p.idusuario) AS idobjetivo
         FROM reportes r LEFT JOIN publicaciones p ON p.idpublicacion = r.idpublicacion
         WHERE r.idreporte = ? AND r.estado = 'pendiente'`,
        [idreporte]
      );
      if (rep.length === 0) throw new ErrorHttp(409, 'El reporte no existe o ya fue atendido');
      if (rep[0].idobjetivo !== idusuario) throw new ErrorHttp(400, 'El reporte no corresponde a ese usuario');
    }

    const conexion = await pool.getConnection();
    try {
      await conexion.beginTransaction();
      await conexion.query(
        `INSERT INTO sanciones (idusuario, idreporte, idadmin, tipo, motivo, fecha_fin)
         VALUES (?, ?, ?, ?, ?, ${tipo === 'suspension' ? "(NOW() + (? * INTERVAL '1 day'))" : '?'})`,
        [idusuario, idreporte || null, idadmin, tipo, motivo, tipo === 'suspension' ? dias : null]
      );
      if (tipo === 'baneo') await conexion.query('UPDATE usuarios SET activo = false WHERE idusuario = ?', [idusuario]);
      if (idreporte) {
        await conexion.query(
          "UPDATE reportes SET estado = 'resuelto', idadmin = ? WHERE idreporte = ? AND estado = 'pendiente'",
          [idadmin, idreporte]
        );
      }
      await conexion.commit();
    } catch (error) {
      await conexion.rollback();
      throw error;
    } finally {
      conexion.release();
    }
  }

  // Revierte una sanción dentro de una transacción ya abierta (la usan "revertir" y "aceptar apelación").
  //  - Se marca fecha_revertida (no se borra: queda el historial).
  //  - Un baneo revertido reactiva la cuenta, salvo que tenga OTRO baneo vigente.
  //  - Si había una apelación pendiente, se cierra como aceptada.
  async function revertirConConexion(conexion, idsancion, idadmin) {
    const [filas] = await conexion.query('SELECT idusuario, tipo, fecha_revertida FROM sanciones WHERE idsancion = ? FOR UPDATE', [idsancion]);
    if (filas.length === 0) throw new ErrorHttp(404, 'La sanción no existe');
    if (filas[0].fecha_revertida) throw new ErrorHttp(409, 'Esa sanción ya fue revertida');
    await conexion.query('UPDATE sanciones SET fecha_revertida = NOW(), idadmin_reversion = ? WHERE idsancion = ?', [idadmin, idsancion]);
    if (filas[0].tipo === 'baneo') {
      const [otro] = await conexion.query(
        "SELECT 1 FROM sanciones WHERE idusuario = ? AND tipo = 'baneo' AND fecha_revertida IS NULL", [filas[0].idusuario]
      );
      // OJO: esto reactiva la cuenta aunque estuviera desactivada por otra razón (p. ej. baja voluntaria).
      // Si necesitas distinguirlo, agrega una columna que registre el motivo de la desactivación.
      if (otro.length === 0) await conexion.query('UPDATE usuarios SET activo = true WHERE idusuario = ?', [filas[0].idusuario]);
    }
    await conexion.query(
      `UPDATE apelaciones SET estado = 'aceptada', idadmin = ?, fecha_resolucion = NOW(),
        respuesta = COALESCE(respuesta, 'Revisamos tu caso y la sanción fue revertida.')
       WHERE idsancion = ? AND estado = 'pendiente'`,
      [idadmin, idsancion]
    );
  }

  async function revertirSancion(idsancion, idadmin) {
    const conexion = await pool.getConnection();
    try {
      await conexion.beginTransaction();
      await revertirConConexion(conexion, idsancion, idadmin);
      await conexion.commit();
    } catch (error) {
      await conexion.rollback();
      throw error;
    } finally {
      conexion.release();
    }
  }

  // Las sanciones de una persona (para su zona de "Avisos de tu cuenta").
  async function sancionesDe(idusuario) {
    const [f] = await pool.query(
      `SELECT s.idsancion, s.tipo, s.motivo, s.fecha, s.fecha_fin, s.fecha_revertida, ${ESTADO_SANCION} AS estado
       FROM sanciones s WHERE s.idusuario = ? ORDER BY s.fecha DESC`,
      [idusuario]
    );
    return f;
  }

  // La sanción que hoy le impide entrar a su cuenta: baneo sin revertir o suspensión en curso.
  // Incluye el estado de su apelación (si ya mandó una) para mostrarlo en la pantalla de login.
  async function sancionVigente(idusuario) {
    const [f] = await pool.query(
      `SELECT s.idsancion, s.tipo, s.motivo, s.fecha, s.fecha_fin,
        a.idapelacion, a.estado AS apelacion_estado, a.respuesta AS apelacion_respuesta
       FROM sanciones s LEFT JOIN apelaciones a ON a.idsancion = s.idsancion
       WHERE s.idusuario = ? AND s.fecha_revertida IS NULL
         AND (s.tipo = 'baneo' OR (s.tipo = 'suspension' AND s.fecha_fin > NOW()))
       ORDER BY s.fecha DESC LIMIT 1`,
      [idusuario]
    );
    return f[0] || null;
  }

  // Historial general para el panel de admin.
  async function listarSanciones() {
    const [f] = await pool.query(
      `SELECT s.idsancion, s.tipo, s.motivo, s.fecha, s.fecha_fin, s.fecha_revertida,
        ${ESTADO_SANCION} AS estado, u.nombre, u.apellido, u.idusuario
       FROM sanciones s JOIN usuarios u ON u.idusuario = s.idusuario
       ORDER BY s.fecha DESC LIMIT 100`
    );
    return f;
  }

  // ---------------------------------------------------------------- APELACIONES
  // idusuario es opcional: si lo pasas, se comprueba que la sanción sea de esa persona.
  async function crearApelacion(idsancion, mensaje, idusuario) {
    const [s] = await pool.query(
      'SELECT idusuario, tipo, fecha_fin, fecha_revertida FROM sanciones WHERE idsancion = ?',
      [idsancion]
    );
    if (s.length === 0) throw new ErrorHttp(404, 'La sanción no existe');
    if (idusuario !== undefined && s[0].idusuario !== idusuario) throw new ErrorHttp(403, 'Esa sanción no es tuya');
    if (s[0].fecha_revertida) throw new ErrorHttp(409, 'Esa sanción ya fue revertida');
    if (s[0].tipo === 'suspension' && new Date(s[0].fecha_fin) <= new Date()) {
      throw new ErrorHttp(409, 'Esa suspensión ya finalizó');
    }

    try {
      const [r] = await pool.query('INSERT INTO apelaciones (idsancion, mensaje) VALUES (?, ?)', [idsancion, mensaje]);
      return r.insertId;
    } catch (error) {
      if (error.code === '23505') throw new ErrorHttp(409, 'Ya enviaste una apelación para esta sanción');
      if (error.code === '23503') throw new ErrorHttp(404, 'La sanción no existe');
      throw error;
    }
  }

  async function listarApelaciones(estado) {
    const [f] = await pool.query(
      `SELECT a.idapelacion, a.mensaje, a.estado, a.respuesta, a.fecha, a.idsancion,
        s.tipo, s.motivo AS sancion_motivo, s.fecha AS sancion_fecha, s.fecha_fin,
        u.idusuario, u.nombre, u.apellido, u.correo
       FROM apelaciones a
       JOIN sanciones s ON s.idsancion = a.idsancion
       JOIN usuarios u ON u.idusuario = s.idusuario
       WHERE a.estado = ? ORDER BY a.fecha DESC LIMIT 100`,
      [estado]
    );
    return f;
  }

  // El admin resuelve la apelación: aceptar = revertir la sanción; rechazar = se queda y se le explica por qué.
  async function resolverApelacion(idapelacion, idadmin, aceptar, respuesta) {
    const conexion = await pool.getConnection();
    try {
      await conexion.beginTransaction();
      const [f] = await conexion.query(
        "SELECT idsancion FROM apelaciones WHERE idapelacion = ? AND estado = 'pendiente' FOR UPDATE",
        [idapelacion]
      );
      if (f.length === 0) throw new ErrorHttp(409, 'La apelación no existe o ya fue resuelta');

      if (aceptar) {
        if (respuesta) await conexion.query('UPDATE apelaciones SET respuesta = ? WHERE idapelacion = ?', [respuesta, idapelacion]);
        await revertirConConexion(conexion, f[0].idsancion, idadmin); // esto también cierra la apelación como aceptada
      } else {
        await conexion.query(
          "UPDATE apelaciones SET estado = 'rechazada', respuesta = ?, idadmin = ?, fecha_resolucion = NOW() WHERE idapelacion = ?",
          [respuesta || 'Revisamos tu caso y la sanción se mantiene.', idadmin, idapelacion]
        );
      }
      await conexion.commit();
    } catch (error) {
      await conexion.rollback();
      throw error;
    } finally {
      conexion.release();
    }
  }

  // ---------------------------------------------------------------- RESUMEN
  async function resumen() {
    const [[f]] = await pool.query(
      `SELECT
        (SELECT COUNT(*)::int FROM reportes WHERE estado = 'pendiente') AS reportes_pendientes,
        (SELECT COUNT(*)::int FROM apelaciones WHERE estado = 'pendiente') AS apelaciones_pendientes,
        (SELECT COUNT(*)::int FROM usuarios WHERE rol = 'usuario' AND activo = true) AS usuarios_activos,
        (SELECT COUNT(*)::int FROM publicaciones WHERE disponibilidad = 'disponible') AS publicaciones_disponibles,
        (SELECT COUNT(*)::int FROM sanciones WHERE fecha_revertida IS NULL
           AND (tipo = 'baneo' OR (tipo = 'suspension' AND fecha_fin > NOW()))) AS sanciones_vigentes`
    );
    return f;
  }

  return {
    crearReporte, listarReportes, usuariosReportados, cerrarReporte,
    sancionar, revertirSancion, sancionesDe, sancionVigente, listarSanciones,
    crearApelacion, listarApelaciones, resolverApelacion, resumen,
  };
}

module.exports = { crearModeloModeracion };