// Todo lo que tiene que ver con el TOKEN en sí: firmarlo y comprobar que es auténtico.
// (Quién es el usuario y qué rol tiene se decide en sesion.middleware.js.)
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { ErrorHttp } = require('../utilidades');

function crearJWT(config, tokens) {
  const SECRETO = process.env.JWT_SECRET;

  // Crea un token para el usuario. Dentro viaja solo su id (sub) y un jti único.
  // El rol NO va en el token: se lee de la base en cada petición, así un cambio de rol o un baneo aplica de inmediato.
  function firmar(usuario) {
    return jwt.sign({ sub: String(usuario.idusuario) }, SECRETO, {
      algorithm: 'HS256',
      expiresIn: config.jwtExpiraSeg,
      jwtid: crypto.randomUUID(), // jti: identificador único, es lo que se guarda en la lista negra
    });
  }

  // Saca el token del encabezado "Authorization: Bearer <token>". Devuelve null si no viene.
  function extraerToken(req) {
    const encabezado = req.headers.authorization || '';
    return encabezado.startsWith('Bearer ') ? encabezado.slice(7) : null;
  }

  // Comprueba firma, vencimiento y lista negra. Devuelve los datos del token o lanza ErrorHttp 401.
  async function verificar(token) {
    let datos;
    try {
      datos = jwt.verify(token, SECRETO, { algorithms: ['HS256'] });
    } catch (error) {
      if (error.name === 'TokenExpiredError') throw new ErrorHttp(401, 'Tu sesión expiró, vuelve a iniciar sesión');
      throw new ErrorHttp(401, 'Token inválido');
    }
    if (config.jwtRevocar && (await tokens.estaRevocado(datos.jti))) {
      throw new ErrorHttp(401, 'Esa sesión ya fue cerrada, vuelve a iniciar sesión');
    }
    return datos;
  }

  return { firmar, extraerToken, verificar };
}

module.exports = { crearJWT };
