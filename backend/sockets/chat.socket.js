
const { WebSocketServer } = require('ws');
const { ErrorHttp } = require('../utilidades');

function crearSocketChat(servidorHttp, { sesion, jwtAuth, modelos }) {
  const wss = new WebSocketServer({ server: servidorHttp, path: '/ws' });
  const salas = new Map(); 
  function enviar(ws, objeto) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(objeto));
  }

  function difundir(idsolicitud, mensaje) {
    for (const ws of salas.get(idsolicitud) || []) enviar(ws, { tipo: 'mensaje', mensaje });
  }

  async function solicitudPermitida(ws, idsolicitud) {
    const s = await modelos.solicitudes.obtener(Number(idsolicitud));
    if (!s || !modelos.solicitudes.esParticipante(s, ws.usuario.idusuario)) throw new ErrorHttp(404, 'La solicitud no existe');
    return s;
  }

  wss.on('connection', async (ws, req) => {
    try {
      const token = new URL(req.url, 'http://localhost').searchParams.get('token');
      const { jwt, usuario } = await sesion.autenticar(token);
      if (usuario.rol !== 'usuario') throw new Error('El admin no usa el chat');
      ws.usuario = usuario;
      ws.token = token;
      ws.exp = jwt.exp;
    } catch (error) {
      ws.close(4401, 'No autorizado');
      return;
    }
    ws.salas = new Set();

    ws.on('message', async (bruto) => {
      try {
        const datos = JSON.parse(bruto.toString());
        await jwtAuth.verificar(ws.token);

        if (datos.tipo === 'unirse') {
          await solicitudPermitida(ws, datos.idsolicitud);
          const id = Number(datos.idsolicitud);
          if (!salas.has(id)) salas.set(id, new Set());
          salas.get(id).add(ws);
          ws.salas.add(id);
          enviar(ws, { tipo: 'unido', idsolicitud: id });
        } else if (datos.tipo === 'mensaje') {
          const s = await solicitudPermitida(ws, datos.idsolicitud);
          if (s.estado !== 'aceptada') throw new ErrorHttp(409, 'El chat se habilita cuando la solicitud está aceptada');
          const mensaje = await modelos.mensajes.crear(s.idsolicitud, ws.usuario.idusuario, datos.contenido);
          difundir(s.idsolicitud, mensaje);
        }
      } catch (error) {
        enviar(ws, { tipo: 'error', error: error instanceof ErrorHttp ? error.message : 'No se pudo procesar el mensaje' });
        if (!(error instanceof ErrorHttp)) console.error('Error en el chat:', error);
      }
    });

    ws.on('close', () => {
      for (const id of ws.salas) {
        const sala = salas.get(id);
        if (sala) {
          sala.delete(ws);
          if (sala.size === 0) salas.delete(id);
        }
      }
    });
  });

  return { difundir };
}

module.exports = { crearSocketChat };
