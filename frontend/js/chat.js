// solicitudes-chat.html (wireframes 8 y 9): "Mis solicitudes" / "Solicitudes recibidas", detalle y chat en tiempo real.
// El chat se habilita cuando el dueño ACEPTA la solicitud; el dueño también confirma la entrega.
(async function () {
  if (!Auth.token()) return;
  const yo = Auth.usuario();
  const $ = (id) => document.getElementById(id);
  const listaEl = $('lista-sol');
  const detalleEl = $('detalle-sol');
  let tipoLista = 'enviadas'; // pestaña activa
  let solicitudes = [];
  let activa = null; // la solicitud abierta
  let vistos = new Set(); // ids de mensajes ya dibujados (evita duplicados)
  let ws = null;

  // ---------- WebSocket (tiempo real) ----------
  // El token va en la URL porque el navegador no deja mandar encabezados en un WebSocket.
  function conectar() {
    ws = new WebSocket(`${urlWebSocket()}?token=${encodeURIComponent(Auth.token())}`); // el WebSocket está en el BACKEND
    ws.onopen = () => { if (activa) unirseASala(); };
    ws.onmessage = (evento) => {
      const d = JSON.parse(evento.data);
      if (d.tipo === 'mensaje' && activa && d.mensaje.idsolicitud === activa.idsolicitud) agregarMensaje(d.mensaje);
      else if (d.tipo === 'error') aviso(d.error, 'error');
    };
    ws.onclose = () => { ws = null; }; // si se cae, los mensajes se mandan por HTTP
  }
  function unirseASala() {
    if (ws && ws.readyState === WebSocket.OPEN && activa) ws.send(JSON.stringify({ tipo: 'unirse', idsolicitud: activa.idsolicitud }));
  }

  // ---------- Lista ----------
  const otraPersona = (s, lista) => lista === 'recibidas'
    ? { id: s.idsolicitante, n: s.solicitante_nombre, a: s.solicitante_apellido, foto: s.solicitante_foto, pts: s.solicitante_puntos }
    : { id: s.iddueno, n: s.dueno_nombre, a: s.dueno_apellido, foto: s.dueno_foto, pts: s.dueno_puntos };

  async function cargarLista(seleccionar) {
    try { solicitudes = await API.get('/solicitudes/' + tipoLista); } catch (error) { return mostrarError(error); }
    $('titulo-lista').textContent = tipoLista === 'enviadas' ? `Mis solicitudes · ${solicitudes.length}` : `Solicitudes recibidas · ${solicitudes.length}`;
    $('pie-lista').textContent = tipoLista === 'enviadas' ? 'Aquí aparecen los artículos que has solicitado.' : 'Estas personas han solicitado artículos de tus publicaciones.';
    $('subtitulo').textContent = tipoLista === 'enviadas' ? 'Sigue tus solicitudes y coordina entregas con tu comunidad.' : 'Revisa quién necesita tus artículos y decide con quién compartirlos.';
    listaEl.innerHTML = solicitudes.length ? solicitudes.map((s) => {
      const o = otraPersona(s, tipoLista);
      return `<button type="button" class="item-sol ${activa && activa.idsolicitud === s.idsolicitud ? 'activo' : ''}" data-id="${s.idsolicitud}">
        <span class="linea"><span class="persona">${avatarHtml(o.foto, o.n, o.a, 'chico')}<strong>${esc(nombreCompleto(o.n, o.a))}</strong></span><span class="meta">${esc(fechaRelativa(s.fecha_solicitud))}</span></span>
        <strong>${esc(s.pub_nombre)}</strong>
        <span class="linea"><span class="etiqueta ${esc(s.estado)}">${ETIQUETAS.estado[s.estado]}</span></span>
        <span class="recorte">${esc(s.mensaje)}</span></button>`;
    }).join('') : '<p class="vacio">No hay solicitudes aquí.</p>';
    if (seleccionar) abrir(seleccionar);
  }
  listaEl.addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) abrir(Number(b.dataset.id)); });
  document.querySelectorAll('[data-lista]').forEach((b) => b.addEventListener('click', () => {
    tipoLista = b.dataset.lista;
    document.querySelectorAll('[data-lista]').forEach((x) => x.classList.toggle('activo', x === b));
    activa = null;
    detalleEl.innerHTML = '<p class="vacio">Elige una solicitud para ver el detalle y el chat.</p>';
    cargarLista();
  }));

  // ---------- Una solicitud abierta ----------
  async function abrir(id) {
    try { activa = await API.get('/solicitudes/' + id); } catch (error) { return mostrarError(error); }
    vistos = new Set();
    const s = activa;
    const esDueno = s.iddueno === yo.idusuario;
    const o = otraPersona(s, esDueno ? 'recibidas' : 'enviadas');
    const textoEstado = { pendiente: 'Solicitud pendiente', aceptada: 'Solicitud aceptada', rechazada: 'Solicitud rechazada', completada: 'Entrega confirmada' }[s.estado];

    // Bloque central según el estado
    let cuerpo = `<div class="bloque-mensaje"><small>Mensaje de ${esc(esDueno ? s.solicitante_nombre : 'ti')}</small><p style="margin:.2rem 0 0;white-space:pre-wrap">${esc(s.mensaje)}</p>
      ${s.ofrecida_nombre ? `<p class="meta" style="margin:.4rem 0 0">Ofrece a cambio: <a href="/publicacion.html?id=${s.idpublicacion_ofrecida}">${esc(s.ofrecida_nombre)}</a></p>` : ''}</div>`;
    if (s.estado === 'pendiente' && esDueno) {
      cuerpo += `<div class="decision"><h3>¿Quieres aceptar esta solicitud?</h3>
        <p class="meta">Al aceptar, se habilita el chat para coordinar una entrega segura.</p>
        <div class="acciones"><button class="boton" data-estado="aceptar">${icono('check', 16)} Aceptar solicitud</button><button class="boton claro" data-estado="rechazar">Rechazar</button></div>
        <div class="aviso-seguridad">${icono('escudo', 20)}<span>Mantén la conversación aquí y elige un lugar público para la entrega.</span></div></div>`;
    } else if (s.estado === 'pendiente') {
      cuerpo += `<p class="meta">Esperando respuesta de ${esc(s.dueno_nombre)}. Cuando acepte, aquí se habilitará el chat.</p>`;
    } else if (s.estado === 'rechazada') {
      cuerpo += '<p class="meta">Esta solicitud fue rechazada.</p>';
    }
    if (['aceptada', 'completada'].includes(s.estado)) {
      cuerpo += `<h3 style="margin-top:1rem">Chat</h3><div class="mensajes" id="mensajes" aria-live="polite"></div>`;
    }
    const acciones = esDueno && s.estado === 'aceptada'
      ? `<div class="acciones" style="margin:.8rem 0 0"><button class="boton durazno chico" data-estado="completar">Confirmar entrega</button><button class="boton claro chico" data-estado="rechazar">Cancelar solicitud</button></div>` : '';

    detalleEl.innerHTML = `
      <div class="chat-cabecera"><a class="persona" href="/perfil.html?id=${o.id}">${avatarHtml(o.foto, o.n, o.a)}
        <span><strong>${esc(nombreCompleto(o.n, o.a))}</strong><br><span class="meta">${puntosTexto(o.pts, o.pts ? 1 : 0)}</span></span></a></div>
      <div class="chat-articulo"><img src="${fotoUrl(s.pub_foto)}" alt="">
        <div class="info"><strong>${esc(s.pub_nombre)}</strong><br><span class="meta">${ETIQUETAS.modalidad[s.pub_modalidad]} · ${textoEstado}</span></div>
        <a href="/publicacion.html?id=${s.idpublicacion}">Ver artículo</a></div>
      <div class="chat-cuerpo">${cuerpo}${acciones}</div>
      ${s.estado === 'aceptada' ? `<form class="envio" id="form-msg" novalidate><label class="solo-lectores" for="texto-msg">Mensaje</label>
        <input id="texto-msg" maxlength="1000" placeholder="Escribe un mensaje…" autocomplete="off"><button class="boton" type="submit">Enviar</button></form>` : ''}`;

    listaEl.querySelectorAll('.item-sol').forEach((b) => b.classList.toggle('activo', Number(b.dataset.id) === id));

    // Botones de estado (solo el dueño los ve; el servidor igual lo exige).
    detalleEl.querySelectorAll('[data-estado]').forEach((b) => b.addEventListener('click', async () => {
      if (b.dataset.estado === 'rechazar' && !confirm('¿Seguro que quieres rechazar esta solicitud?')) return;
      try {
        await API.patch(`/solicitudes/${id}/${b.dataset.estado}`);
        aviso('Listo');
        await cargarLista(id); // se recarga todo para ver el nuevo estado
        Calificaciones.pintarPendientes($('lista-calif'), $('pendientes-calif'));
      } catch (error) { mostrarError(error); }
    }));

    if (['aceptada', 'completada'].includes(s.estado)) {
      try { (await API.get('/mensajes/solicitud/' + id)).forEach(agregarMensaje); } catch (error) { mostrarError(error); }
      unirseASala();
    }
    const formMsg = $('form-msg');
    if (formMsg) formMsg.addEventListener('submit', enviarMensaje);
  }

  function agregarMensaje(m) {
    if (vistos.has(m.idmensaje)) return;
    vistos.add(m.idmensaje);
    const caja = $('mensajes');
    if (!caja) return;
    const div = document.createElement('div');
    div.className = 'burbuja' + (m.idremitente === yo.idusuario ? ' mia' : '');
    div.innerHTML = `${esc(m.contenido)}<small>${esc(String(m.fecha_envio).slice(11, 16))}</small>`;
    caja.appendChild(div);
    caja.scrollTop = caja.scrollHeight;
  }

  async function enviarMensaje(e) {
    e.preventDefault();
    const campo = $('texto-msg');
    const error = Validar.texto(campo.value, 'El mensaje', 1, 1000);
    if (error) { if (campo.value.trim()) aviso(error, 'error'); return; }
    const contenido = campo.value.trim();
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ tipo: 'mensaje', idsolicitud: activa.idsolicitud, contenido }));
      } else {
        agregarMensaje(await API.post('/mensajes/solicitud/' + activa.idsolicitud, { contenido })); // plan B por HTTP
      }
      campo.value = '';
    } catch (err) { mostrarError(err); }
  }

  // ---------- Arranque ----------
  conectar();
  Calificaciones.pintarPendientes($('lista-calif'), $('pendientes-calif'));

  // Si la URL trae ?id=N se abre esa solicitud, en la pestaña que le toque.
  const idUrl = parametro('id');
  if (idUrl) {
    try {
      const s = await API.get('/solicitudes/' + idUrl);
      tipoLista = s.iddueno === yo.idusuario ? 'recibidas' : 'enviadas';
      document.querySelectorAll('[data-lista]').forEach((x) => x.classList.toggle('activo', x.dataset.lista === tipoLista));
      await cargarLista(Number(idUrl));
      return;
    } catch (error) { mostrarError(error); }
  }
  cargarLista();
})();
