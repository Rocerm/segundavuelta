const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { ErrorHttp } = require('../utilidades');

function crearJWT(config, tokens) {
  const SECRETO = process.env.JWT_SECRET;

  function firmar(usuario) {
    return jwt.sign({ sub: String(usuario.idusuario) }, SECRETO, {
      algorithm: 'HS256',
      expiresIn: config.jwtExpiraSeg,
      jwtid: crypto.randomUUID(), // jti: identificador único, es lo que se guarda en la lista negra
    });
  }

  function extraerToken(req) {
    const encabezado = req.headers.authorization || '';
    return encabezado.startsWith('Bearer ') ? encabezado.slice(7) : null;
  }

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
