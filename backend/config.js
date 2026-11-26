// Configuración general de la aplicación. Aquí se cambian los valores sin tocar el resto del código.
// Después de cada cambio: detén el servidor (Ctrl+C) y vuelve a correr  npm start
module.exports = {

  jwtExpiraSeg: 2 * 60 * 60,


  jwtRevocar: true,


  bcryptRondas: 10,
  contrasenaMinima: 8,

  // ---------- Fotos ----------
  maxFotoBytes: 3 * 1024 * 1024, // 3 MB
  tiposImagen: { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' },

  publicacionesPorPagina: 12,

  limpiezaTokensMs: 60 * 60 * 1000,
};
