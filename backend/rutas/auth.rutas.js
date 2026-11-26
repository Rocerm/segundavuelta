const express = require('express');
const config = require('../config');
const { ErrorHttp, texto, nombrePersona, correo, contrasena, entero } = require('../utilidades');

const MAX_FALLOS = 5;
const VENTANA_MS = 10 * 60 * 1000;
const fallos = new Map(); // "ip|correo" → { n, desde }
function revisarFreno(clave) {
  const f = fallos.get(clave);
  if (f && Date.now() - f.desde > VENTANA_MS) fallos.delete(clave);
  if (fallos.get(clave) && fallos.get(clave).n >= MAX_FALLOS) {
    throw new ErrorHttp(429, 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo');
  }
}
function anotarFallo(clave) {
  const f = fallos.get(clave) || { n: 0, desde: Date.now() };
  f.n += 1;
  fallos.set(clave, f);
}

function crearRutas({ modelos, jwtAuth, requiereSesion }) {
  const router = express.Router();


  const seguro = (u) => ({
    idusuario: u.idusuario, nombre: u.nombre, apellido: u.apellido, correo: u.correo,
    rol: u.rol, idalcaldia: u.idalcaldia, foto_perfil: u.foto_perfil || null,
  });

  async function credenciales(req) {
    const b = req.body || {};
    const correoTexto = typeof b.correo === 'string' ? b.correo.trim().toLowerCase().slice(0, 150) : '';
    const clave = `${req.ip}|${correoTexto}`;
    revisarFreno(clave);
    const usuario = typeof b.contrasena === 'string' ? await modelos.usuarios.verificar(correoTexto, b.contrasena) : null;
    if (!usuario) {
      anotarFallo(clave);
      // Mismo mensaje si falla el correo o la contraseña: no se revela cuál de los dos estaba mal.
      throw new ErrorHttp(401, 'Correo o contraseña incorrectos');
    }
    fallos.delete(clave);
    return usuario;
  }

  router.post('/registro', async (req, res) => {
    const b = req.body || {};
    const datos = {
      nombre: nombrePersona(b.nombre, 'El nombre'),
      apellido: nombrePersona(b.apellido, 'El apellido'),
      correo: correo(b.correo),
      contrasena: contrasena(b.contrasena),
      idalcaldia: entero(b.idalcaldia, 'La alcaldía'),
    };
    const id = await modelos.usuarios.crear(datos);
    // Se arma el usuario con lo que ya se sabe (no hace falta volver a consultar la base).
    const usuario = { idusuario: id, nombre: datos.nombre, apellido: datos.apellido, correo: datos.correo, rol: 'usuario', idalcaldia: datos.idalcaldia, foto_perfil: null };
    res.status(201).json({ token: jwtAuth.firmar(usuario), usuario: seguro(usuario) });
  });

  router.post('/login', async (req, res) => {
    const usuario = await credenciales(req);

    
    if (!usuario.activo || usuario.suspendido_hasta) {
      const sancion = await modelos.moderacion.sancionVigente(usuario.idusuario);
      if (sancion) {
        const texto403 = sancion.tipo === 'baneo' ? 'Tu cuenta fue baneada' : `Tu cuenta está suspendida hasta ${sancion.fecha_fin}`;
        throw new ErrorHttp(403, texto403, { sancion });
      }
      throw new ErrorHttp(403, 'Tu cuenta está desactivada');
    }
    res.json({ token: jwtAuth.firmar(usuario), usuario: seguro(usuario) });
  });

 
  router.post('/apelaciones', async (req, res) => {
    const usuario = await credenciales(req);
    const mensaje = texto((req.body || {}).mensaje, 'Tu explicación', { min: 10, max: 500, multilinea: true });
    const sancion = await modelos.moderacion.sancionVigente(usuario.idusuario);
    if (!sancion) throw new ErrorHttp(400, 'Tu cuenta no tiene ninguna sanción que apelar');
    await modelos.moderacion.crearApelacion(sancion.idsancion, mensaje);
    res.status(201).json({ mensaje: 'Recibimos tu explicación. Un administrador la revisará.' });
  });


  router.post('/logout', requiereSesion, async (req, res) => {
    if (config.jwtRevocar) {
      await modelos.tokens.revocar(req.jwt.jti, req.usuario.idusuario, req.jwt.exp);
      return res.json({ mensaje: 'Sesión cerrada', revocado: true });
    }
    res.json({ mensaje: 'Sesión cerrada (el servidor no guarda nada, el token vence solo)', revocado: false });
  });

  router.get('/yo', requiereSesion, async (req, res) => {
    res.json(await modelos.usuarios.obtenerPropio(req.usuario.idusuario));
  });

  return router;
}

module.exports = { crearRutas };
