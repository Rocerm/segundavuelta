// "Sesión" con JWT: no hay nada guardado en el servidor, cada petición trae su token.
//  requiereSesion → 401 si no hay token válido, 403 si la cuenta está desactivada/baneada/suspendida.
//  requiereRol    → 403 si el rol del usuario no es el permitido.
const { ErrorHttp } = require('../utilidades');

function crearSesion(jwtAuth, usuarios) {
  // Valida el token Y el estado actual de la cuenta. Lo usan las rutas y también el chat (WebSocket).
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
      req.jwt = jwt; // datos del token (jti y exp se usan al cerrar sesión)
      req.usuario = usuario; // { idusuario, nombre, apellido, rol, idalcaldia }
      next();
    } catch (error) {
      next(error); // el manejador de errores de app.js contesta con el código correcto
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
