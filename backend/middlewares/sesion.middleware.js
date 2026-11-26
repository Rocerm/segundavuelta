const { ErrorHttp } = require('../utilidades');

function crearSesion(jwtAuth, usuarios) {
  async function autenticar(token) {
    if (!token) throw new ErrorHttp(401, 'Falta iniciar sesión');
    const datos = await jwtAuth.verificar(token);
    const u = await usuarios.estadoAcceso(Number(datos.sub));
    if (!u) throw new ErrorHttp(401, 'La cuenta ya no existe');
    if (!u.activo) throw new ErrorHttp(403, 'Tu cuenta está desactivada o baneada');
    if (u.suspendido_hasta) throw new ErrorHttp(403, `Tu cuenta está suspendida hasta ${u.suspendido_hasta}`);
    return { jwt: datos, usuario: u };
  }

  async function requiereSesion(req, res, next) {
    try {
      const { jwt, usuario } = await autenticar(jwtAuth.extraerToken(req));
      req.jwt = jwt;
      req.usuario = usuario; 
      next();
    } catch (error) {
      next(error); 
    }
  }

  function requiereRol(...roles) {
    return (req, res, next) => {
      if (!roles.includes(req.usuario.rol)) {
        return next(new ErrorHttp(403, 'No tienes permiso para esta acción'));
      }
      next();
    };
  }

  return { autenticar, requiereSesion, requiereRol };
}

module.exports = { crearSesion };
