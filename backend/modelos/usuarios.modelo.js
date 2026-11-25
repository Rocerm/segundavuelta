// Consultas a usuarios, usuario_categoria (intereses) y alcaldías del perfil.
// Siempre con ? (consulta parametrizada), nunca pegando texto en el SQL.
const bcrypt = require('bcryptjs');
const config = require('../config');
const { ErrorHttp } = require('../utilidades');

// Columnas que se pueden mostrar sin riesgo (NUNCA contrasena_hash).
const PUBLICO = `u.idusuario, u.nombre, u.apellido, u.foto_perfil, u.biografia, u.fecha_registro,
  u.idalcaldia, a.nombre AS alcaldia,
  r.total_calificaciones, r.puntos_confianza`;

// Hash de relleno con el MISMO costo que los reales: así verificar() tarda igual
// exista o no el correo, y no revela qué cuentas están registradas.
const HASH_FALSO = bcrypt.hashSync('relleno-para-igualar-tiempos', config.bcryptRondas);

// bcrypt solo usa los primeros 72 bytes de la contraseña.
const MAX_BYTES_CONTRASENA = 72;

// Los correos se guardan y se buscan en minúsculas y sin espacios alrededor.
function normalizarCorreo(correo) {
  return String(correo || '').trim().toLowerCase();
}

function crearModeloUsuarios(pool) {
  // Crea la cuenta (rol 'usuario'). Guarda el hash, nunca la contraseña.
  async function crear({ nombre, apellido, correo, contrasena, idalcaldia }) {
    const correoNorm = normalizarCorreo(correo);
    if (Buffer.byteLength(String(contrasena || ''), 'utf8') > MAX_BYTES_CONTRASENA) {
      throw new ErrorHttp(400, 'La contraseña es demasiado larga');
    }

    // Evita duplicados aunque el correo difiera solo en mayúsculas (cuentas anteriores a la normalización).
    const [existe] = await pool.query('SELECT 1 FROM usuarios WHERE lower(correo) = ?', [correoNorm]);
    if (existe.length > 0) throw new ErrorHttp(409, 'Ese correo ya está registrado');

    const hash = await bcrypt.hash(contrasena, config.bcryptRondas);
    try {
      const [r] = await pool.query(
        'INSERT INTO usuarios (nombre, apellido, correo, contrasena_hash, idalcaldia) VALUES (?, ?, ?, ?, ?)',
        [nombre, apellido, correoNorm, hash, idalcaldia]
      );
      return r.insertId;
    } catch (error) {
      if (error.code === '23505') throw new ErrorHttp(409, 'Ese correo ya está registrado');
      if (error.code === '23503') throw new ErrorHttp(400, 'La alcaldía no existe');
      throw error;
    }
  }

  // Regresa el usuario (sin el hash) si la contraseña es correcta, o null si no.
  async function verificar(correo, contrasena) {
    const [filas] = await pool.query(
      `SELECT u.idusuario, u.nombre, u.apellido, u.correo, u.contrasena_hash, u.rol, u.activo, u.idalcaldia, u.foto_perfil,
        (SELECT MAX(s.fecha_fin) FROM sanciones s
          WHERE s.idusuario = u.idusuario AND s.tipo = 'suspension' AND s.fecha_fin > NOW() AND s.fecha_revertida IS NULL) AS suspendido_hasta
       FROM usuarios u WHERE lower(u.correo) = ?`,
      [normalizarCorreo(correo)]
    );
    if (filas.length === 0) {
      // Se compara contra un hash falso para tardar lo mismo y no revelar si el correo existe.
      await bcrypt.compare(String(contrasena || ''), HASH_FALSO);
      return null;
    }
    const { contrasena_hash, ...usuario } = filas[0];
    return (await bcrypt.compare(String(contrasena || ''), contrasena_hash)) ? usuario : null;
  }

  // Lo que necesita el middleware en CADA petición: ¿existe, está activo, está suspendido?
  async function estadoAcceso(idusuario) {
    const [filas] = await pool.query(
      `SELECT u.idusuario, u.nombre, u.apellido, u.rol, u.activo, u.idalcaldia,
        (SELECT MAX(s.fecha_fin) FROM sanciones s
          WHERE s.idusuario = u.idusuario AND s.tipo = 'suspension' AND s.fecha_fin > NOW() AND s.fecha_revertida IS NULL) AS suspendido_hasta
       FROM usuarios u WHERE u.idusuario = ?`,
      [idusuario]
    );
    return filas[0] || null;
  }

  // Perfil visible para cualquiera (solo cuentas activas).
  async function obtenerPublico(idusuario) {
    const [filas] = await pool.query(
      `SELECT ${PUBLICO} FROM usuarios u
       JOIN alcaldias a ON a.idalcaldia = u.idalcaldia
       LEFT JOIN vista_reputacion r ON r.idusuario = u.idusuario
       WHERE u.idusuario = ? AND u.activo = true`,
      [idusuario]
    );
    return filas[0] || null;
  }

  // Perfil propio: lo mismo + correo, rol e intereses.
  async function obtenerPropio(idusuario) {
    const [filas] = await pool.query(
      `SELECT ${PUBLICO}, u.correo, u.rol FROM usuarios u
       JOIN alcaldias a ON a.idalcaldia = u.idalcaldia
       LEFT JOIN vista_reputacion r ON r.idusuario = u.idusuario
       WHERE u.idusuario = ?`,
      [idusuario]
    );
    if (!filas[0]) return null;
    filas[0].intereses = await obtenerIntereses(idusuario);
    return filas[0];
  }

  async function actualizar(idusuario, { nombre, apellido, biografia, idalcaldia }) {
    try {
      await pool.query(
        'UPDATE usuarios SET nombre = ?, apellido = ?, biografia = ?, idalcaldia = ? WHERE idusuario = ?',
        [nombre, apellido, biografia, idalcaldia, idusuario]
      );
    } catch (error) {
      if (error.code === '23503') throw new ErrorHttp(400, 'La alcaldía no existe');
      throw error;
    }
  }

  // Cambia la foto y devuelve la ruta anterior (para borrar ese archivo).
  async function cambiarFoto(idusuario, ruta) {
    const [antes] = await pool.query('SELECT foto_perfil FROM usuarios WHERE idusuario = ?', [idusuario]);
    await pool.query('UPDATE usuarios SET foto_perfil = ? WHERE idusuario = ?', [ruta, idusuario]);
    return antes[0] ? antes[0].foto_perfil : null;
  }

  async function obtenerIntereses(idusuario) {
    const [f] = await pool.query('SELECT idcategoria FROM usuario_categoria WHERE idusuario = ?', [idusuario]);
    return f.map((x) => x.idcategoria);
  }

  // Reemplaza todos los intereses de golpe (en transacción: o se guardan todos o ninguno).
  async function guardarIntereses(idusuario, ids) {
    // Se convierten a número y se quitan repetidos (un id repetido rompería la llave primaria).
    const unicos = [...new Set((ids || []).map(Number))];
    if (unicos.some((n) => !Number.isInteger(n) || n <= 0)) throw new ErrorHttp(400, 'Los intereses no son válidos');

    const conexion = await pool.getConnection();
    try {
      await conexion.beginTransaction();
      await conexion.query('DELETE FROM usuario_categoria WHERE idusuario = ?', [idusuario]);
      if (unicos.length > 0) {
        const valores = unicos.map(() => '(?, ?)').join(', ');
        await conexion.query(
          `INSERT INTO usuario_categoria (idusuario, idcategoria) VALUES ${valores}`,
          unicos.flatMap((idcategoria) => [idusuario, idcategoria])
        );
      }
      await conexion.commit();
    } catch (error) {
      await conexion.rollback();
      if (error.code === '23503') throw new ErrorHttp(400, 'Alguna de las categorías no existe');
      throw error;
    } finally {
      conexion.release();
    }
  }

  // "Eliminar cuenta" = activo = false (borrado lógico). Sus publicaciones dejan de mostrarse
  // y las solicitudes abiertas donde participa (como solicitante, como dueño o como oferta) se rechazan.
  async function desactivar(idusuario) {
    const conexion = await pool.getConnection();
    try {
      await conexion.beginTransaction();
      await conexion.query('UPDATE usuarios SET activo = false WHERE idusuario = ?', [idusuario]);
      await conexion.query(
        `UPDATE solicitudes SET estado = 'rechazada'
         WHERE estado IN ('pendiente','aceptada')
           AND (idsolicitante = ?
             OR idpublicacion IN (SELECT idpublicacion FROM publicaciones WHERE idusuario = ?)
             OR idpublicacion_ofrecida IN (SELECT idpublicacion FROM publicaciones WHERE idusuario = ?))`,
        [idusuario, idusuario, idusuario]
      );
      await conexion.commit();
    } catch (error) {
      await conexion.rollback();
      throw error;
    } finally {
      conexion.release();
    }
  }

  // Cambiar contraseña: exige la actual (por si alguien se encuentra la sesión abierta).
  async function cambiarContrasena(idusuario, actual, nueva) {
    if (typeof nueva !== 'string' || nueva.length === 0) throw new ErrorHttp(400, 'La nueva contraseña es obligatoria');
    if (Buffer.byteLength(nueva, 'utf8') > MAX_BYTES_CONTRASENA) throw new ErrorHttp(400, 'La nueva contraseña es demasiado larga');

    const [f] = await pool.query('SELECT contrasena_hash FROM usuarios WHERE idusuario = ?', [idusuario]);
    if (f.length === 0) throw new ErrorHttp(404, 'La cuenta no existe');
    if (!(await bcrypt.compare(String(actual || ''), f[0].contrasena_hash))) throw new ErrorHttp(400, 'La contraseña actual no es correcta');
    if (actual === nueva) throw new ErrorHttp(400, 'La nueva contraseña debe ser distinta a la actual');
    const hash = await bcrypt.hash(nueva, config.bcryptRondas);
    await pool.query('UPDATE usuarios SET contrasena_hash = ? WHERE idusuario = ?', [hash, idusuario]);
  }

  return {
    crear, verificar, estadoAcceso, obtenerPublico, obtenerPropio, actualizar, cambiarFoto,
    obtenerIntereses, guardarIntereses, desactivar, cambiarContrasena,
  };
}

module.exports = { crearModeloUsuarios };
