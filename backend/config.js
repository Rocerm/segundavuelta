// Configuración general de la aplicación. Aquí se cambian los valores sin tocar el resto del código.
// Después de cada cambio: detén el servidor (Ctrl+C) y vuelve a correr  npm start
module.exports = {
  // ---------- JWT ----------
  // Todo token debe tener una expiración, en segundos. 2 horas = 2 * 60 * 60
  jwtExpiraSeg: 2 * 60 * 60,

  // true: al cerrar sesión el token se guarda en la lista negra (tabla tokens_revocados)
  //       y ya no se acepta aunque no haya vencido.
  // false: el servidor no guarda nada y el token vive hasta que expire.
  jwtRevocar: true,

  // ---------- Contraseñas ----------
  // Cuántas "vueltas" de costo usa bcrypt. Más alto = más seguro pero más lento.
  bcryptRondas: 10,
  contrasenaMinima: 8,

  // ---------- Fotos ----------
  maxFotoBytes: 3 * 1024 * 1024, // 3 MB
  // Tipos de imagen permitidos y la extensión con la que se guardan.
  tiposImagen: { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' },

  // ---------- Listados ----------
  publicacionesPorPagina: 12,

  // Cada cuánto se borran de la lista negra los tokens que ya vencieron (ms). 1 hora.
  limpiezaTokensMs: 60 * 60 * 1000,
};
