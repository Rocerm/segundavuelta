// publicacion.html?id=N (wireframe 5). Tres vistas del mismo artículo:
//   - cualquier usuario: puede solicitarlo o reportarlo
//   - el dueño: edita, cambia disponibilidad, elimina y atiende sus solicitudes
//   - el admin: solo lo revisa y, si hace falta, lo elimina (no publica ni solicita)
(async function () {
  if (!Auth.token()) return;
  const id = parametro('id');
  const caja = document.getElementById('contenido');
  const yo = Auth.usuario();
  const esAdmin = yo.rol === 'admin';
  if (!id) { caja.innerHTML = '<p class="vacio">Falta el número de la publicación.</p>'; return; }

  async function cargar() {
    let p;
    try { p = await API.get('/publicaciones/' + id); }
    catch (error) { caja.innerHTML = `<p class="vacio">${esc(error.message)}</p>`; return; }

    const esDueno = p.idusuario === yo.idusuario;
    const volver = esAdmin ? '/admin.html#publicaciones' : '/index.html';
    caja.innerHTML = `
      <div class="migas-detalle">
        <a class="volver" href="${volver}">${icono('atras', 18)} ${esAdmin ? 'Publicaciones' : 'Inicio'} / ${esc(p.categoria)}</a>
        <div id="zona-reporte"></div>
      </div>
      <div class="detalle">
        <div>
          <div class="foto-grande"><img src="${fotoUrl(p.foto)}" alt="Foto de ${esc(p.nombre_articulo)}"></div>
          <div class="aviso-seguridad">${icono('escudo', 22)}<div><strong>Cuídate</strong><br>Acuerda la entrega en un lugar público y seguro.</div></div>
        </div>
        <div>
          <div class="etiquetas">
            <span class="etiqueta ${esc(p.modalidad)}">${ETIQUETAS.modalidad[p.modalidad]}</span>
            <span class="etiqueta ${esc(p.disponibilidad)}">${ETIQUETAS.disponibilidad[p.disponibilidad]}</span>
          </div>
          <h1 style="margin-top:.7rem">${esc(p.nombre_articulo)}</h1>
          <p class="meta" style="display:flex;gap:.4rem;align-items:center">${icono('pin', 16)} Zona de entrega: ${esc(p.alcaldia)}</p>
          <div class="ficha-datos">
            <div><span>Estado</span><span>${ETIQUETAS.condicion[p.condicion]}</span></div>
            <div><span>Categoría</span><span>${esc(p.categoria)}</span></div>
            ${p.caducidad ? `<div><span>Caducidad</span><span>${fechaCorta(p.caducidad)}</span></div>` : ''}
            <div><span>Modalidad</span><span>${ETIQUETAS.modalidad[p.modalidad]}</span></div>
          </div>
          <h3>Acerca de este artículo</h3>
          <p class="suave" style="white-space:pre-wrap">${esc(p.descripcion)}</p>
          <hr style="border:0;border-top:1px solid var(--borde);margin:1.2rem 0">
          <a class="persona" href="/perfil.html?id=${p.idusuario}">
            ${avatarHtml(p.dueno_foto, p.dueno_nombre, p.dueno_apellido)}
            <span><strong>${esc(nombreCompleto(p.dueno_nombre, p.dueno_apellido))}</strong><br>
            <span class="meta">${puntosTexto(p.dueno_puntos, p.dueno_calificaciones)}</span></span>
          </a>
          <div id="zona-accion"></div>
          <p class="meta" style="margin-top:1rem">Publicado ${fechaRelativa(p.fecha_creacion)}</p>
        </div>
      </div>
      <div id="zona-solicitudes"></div>`;

    if (esAdmin) pintarAdmin(p);
    else if (esDueno) await pintarDueno(p);
    else pintarVisitante(p);
  }

  // ---------- Admin: solo revisa ----------
  function pintarAdmin(p) {
    const zona = document.getElementById('zona-accion');
    if (p.disponibilidad === 'eliminada') { zona.innerHTML = '<p class="meta" style="margin-top:1rem">Esta publicación ya está eliminada.</p>'; return; }
    zona.innerHTML = '<div class="acciones"><button class="boton peligro" id="b-admin-borrar">Eliminar publicación</button></div>';
    document.getElementById('b-admin-borrar').addEventListener('click', async () => {
      if (!confirm('¿Eliminar esta publicación por moderación? Se rechazarán sus solicitudes abiertas.')) return;
      try { await API.del('/publicaciones/' + p.idpublicacion); aviso('Publicación eliminada'); cargar(); } catch (e) { mostrarError(e); }
    });
  }

  // ---------- Dueño ----------
  async function pintarDueno(p) {
    const zona = document.getElementById('zona-accion');
    if (p.disponibilidad === 'eliminada') { zona.innerHTML = '<p class="meta" style="margin-top:1rem">Esta publicación fue eliminada.</p>'; return; }
    const nueva = p.disponibilidad === 'disponible' ? 'no_disponible' : 'disponible';
    zona.innerHTML = `<div class="acciones">
      <a class="boton" href="/nueva-publicacion.html?editar=${p.idpublicacion}">Editar</a>
      <button class="boton claro" id="b-disp">Marcar como ${nueva === 'disponible' ? 'disponible' : 'no disponible'}</button>
      <button class="boton peligro" id="b-borrar">Eliminar</button></div>`;
    document.getElementById('b-disp').addEventListener('click', async () => {
      try { await API.patch(`/publicaciones/${p.idpublicacion}/disponibilidad`, { disponibilidad: nueva }); cargar(); } catch (e) { mostrarError(e); }
    });
    document.getElementById('b-borrar').addEventListener('click', async () => {
      if (!confirm('¿Eliminar esta publicación? Se rechazarán sus solicitudes abiertas.')) return;
      try { await API.del('/publicaciones/' + p.idpublicacion); location.href = '/perfil.html'; } catch (e) { mostrarError(e); }
    });

    // Solicitudes que le llegaron a esta publicación.
    try {
      const sols = await API.get('/solicitudes/recibidas?publicacion=' + p.idpublicacion);
      const zonaSol = document.getElementById('zona-solicitudes');
      zonaSol.innerHTML = '<h2 style="margin-top:2rem">Solicitudes recibidas</h2>' + (sols.length ? sols.map((s) => `
        <div class="panel">
          <div class="persona">${avatarHtml(s.solicitante_foto, s.solicitante_nombre, s.solicitante_apellido, 'chico')}
            <strong>${esc(nombreCompleto(s.solicitante_nombre, s.solicitante_apellido))}</strong>
            <span class="etiqueta ${esc(s.estado)}">${ETIQUETAS.estado[s.estado]}</span></div>
          <p style="margin-top:.6rem">${esc(s.mensaje)}</p>
          ${s.ofrecida_nombre ? `<p class="meta">Ofrece a cambio: ${esc(s.ofrecida_nombre)}</p>` : ''}
          <div class="acciones" style="margin-top:.4rem">
            ${s.estado === 'pendiente' ? `<button class="boton chico" data-estado="aceptar" data-id="${s.idsolicitud}">Aceptar</button>` : ''}
            ${['pendiente', 'aceptada'].includes(s.estado) ? `<button class="boton claro chico" data-estado="rechazar" data-id="${s.idsolicitud}">Rechazar</button>` : ''}
            ${s.estado === 'aceptada' ? `<button class="boton durazno chico" data-estado="completar" data-id="${s.idsolicitud}">Confirmar entrega</button>` : ''}
            <a class="boton claro chico" href="/solicitudes-chat.html?id=${s.idsolicitud}">Abrir chat</a>
          </div></div>`).join('') : '<p class="vacio">Todavía nadie la ha pedido.</p>');
      zonaSol.querySelectorAll('[data-estado]').forEach((b) => b.addEventListener('click', async () => {
        try { await API.patch(`/solicitudes/${b.dataset.id}/${b.dataset.estado}`); aviso('Listo'); cargar(); } catch (e) { mostrarError(e); }
      }));
    } catch (error) { mostrarError(error); }
  }

  // ---------- Cualquier otra persona ----------
  async function pintarVisitante(p) {
    document.getElementById('zona-reporte').innerHTML = `<button class="boton claro chico" id="b-reportar">${icono('bandera', 16)} Reportar publicación</button>`;
    document.getElementById('b-reportar').addEventListener('click', () => Reportes.abrir('publicacion', p.idpublicacion));

    const zona = document.getElementById('zona-accion');
    if (p.disponibilidad !== 'disponible') { zona.innerHTML = '<p class="meta" style="margin-top:1rem">Esta publicación ya no está disponible.</p>'; return; }
    let ofrecibles = [];
    if (p.modalidad === 'intercambio') {
      try { ofrecibles = await API.get('/publicaciones/ofrecibles'); } catch (e) { mostrarError(e); }
    }
    const sinOferta = p.modalidad === 'intercambio' && !ofrecibles.length;
    zona.innerHTML = `
      <div class="acciones"><button class="boton ancho" id="b-pedir" ${sinOferta ? 'disabled' : ''}>Solicitar artículo</button></div>
      <p class="meta" style="margin-top:.8rem">${p.modalidad === 'donacion'
        ? `Esta publicación es una donación. Al solicitarla, se enviará tu interés a ${esc(p.dueno_nombre)} para que pueda aceptarlo.`
        : sinOferta ? 'Para intercambiar necesitas una <a href="/nueva-publicacion.html">publicación de intercambio</a> disponible.'
          : `Esta publicación es un intercambio: ofrece uno de tus artículos a ${esc(p.dueno_nombre)}.`}</p>
      <form id="form-sol" class="panel" style="margin-top:1rem" hidden novalidate>
        ${p.modalidad === 'intercambio' && !sinOferta ? `<label for="s-ofrece">¿Qué ofreces a cambio?</label><select id="s-ofrece">${ofrecibles.map((o) => `<option value="${o.idpublicacion}">${esc(o.nombre_articulo)}</option>`).join('')}</select>` : ''}
        <label for="s-mensaje">Mensaje para ${esc(p.dueno_nombre)}</label>
        <textarea id="s-mensaje" maxlength="500" placeholder="Presentate y cuéntale por qué lo necesitas"></textarea>
        <div class="acciones"><button class="boton" type="submit">Enviar solicitud</button></div>
      </form>`;
    document.getElementById('b-pedir').addEventListener('click', () => { document.getElementById('form-sol').hidden = false; document.getElementById('s-mensaje').focus(); });
    document.getElementById('form-sol').addEventListener('submit', async (e) => {
      e.preventDefault();
      const mensaje = document.getElementById('s-mensaje');
      if (!revisar([[mensaje, Validar.texto(mensaje.value, 'El mensaje', 2, 500)]])) return;
      const ofrece = document.getElementById('s-ofrece');
      try {
        const r = await API.post('/solicitudes', { idpublicacion: p.idpublicacion, mensaje: mensaje.value, idpublicacion_ofrecida: ofrece ? ofrece.value : null });
        location.href = '/solicitudes-chat.html?id=' + r.idsolicitud;
      } catch (error) { mostrarError(error); }
    });
  }

  cargar();
})();
