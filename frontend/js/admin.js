// admin.html: panel de moderación (el admin NO publica, no pide artículos ni chatea).
// Vistas, elegidas con el # de la URL:
//   #resumen  #reportes  #reportes/ID (reportes de una persona)  #reportados  #sanciones  #apelaciones  #publicaciones  #categorias
(async function () {
  if (!Auth.token()) return;
  if (Auth.usuario().rol !== 'admin') { location.replace('/index.html'); return; } // el servidor igual devolvería 403
  const vista = document.getElementById('vista');
  const $ = (id) => document.getElementById(id);
  const titular = (t, s) => { $('titulo-vista').textContent = t; $('sub-vista').textContent = s || ''; };
  let estadoReportes = 'pendiente';
  let paginaPubs = 1;
  const filtrosPubs = { q: '', estado: '', categoria: '' };

  // ---------- Router por # ----------
  function ir() {
    const [nombre, param] = (location.hash || '#resumen').slice(1).split('/');
    const vistas = { resumen, reportes: () => reportes(param), reportados, sanciones, apelaciones, publicaciones, categorias };
    (vistas[nombre] || resumen)();
  }
  window.addEventListener('hashchange', ir);

  // Tarjeta de persona con botones comunes
  const nombreDe = (n, a) => esc(nombreCompleto(n, a));

  // ================= RESUMEN =================
  async function resumen() {
    titular('Resumen', 'Lo que necesita tu atención hoy.');
    try {
      const r = await API.get('/admin/resumen');
      const c = (n, texto, ruta, alerta) => `<a class="contador ${alerta && Number(n) > 0 ? 'alerta' : ''}" href="${ruta}"><b>${n}</b>${texto}</a>`;
      vista.innerHTML = `<div class="contadores">
        ${c(r.reportes_pendientes, 'reportes pendientes', '#reportes', true)}
        ${c(r.apelaciones_pendientes, 'apelaciones por revisar', '#apelaciones', true)}
        ${c(r.sanciones_vigentes, 'sanciones vigentes', '#sanciones')}
        ${c(r.publicaciones_disponibles, 'publicaciones disponibles', '#publicaciones')}
        ${c(r.usuarios_activos, 'usuarios activos', '#reportados')}</div>
        <p class="meta">Puedes revisar todas las publicaciones aunque no tengan reportes, administrar las categorías y revertir una sanción si fue un error.</p>`;
    } catch (error) { mostrarError(error); }
  }

  // ================= REPORTES =================
  async function reportes(idusuario) {
    titular('Reportes', idusuario ? `Reportes de la persona #${idusuario}` : 'Publicaciones y perfiles reportados por la comunidad.');
    try {
      const filas = await API.get(`/admin/reportes?estado=${estadoReportes}${idusuario ? '&usuario=' + encodeURIComponent(idusuario) : ''}`);
      const pildora = (v, t) => `<button type="button" data-estado="${v}" class="${estadoReportes === v ? 'activo' : ''}">${t}</button>`;
      vista.innerHTML = `<div class="pestanas pildoras">${pildora('pendiente', 'Pendientes')}${pildora('resuelto', 'Resueltos')}${pildora('desestimado', 'Desestimados')}${pildora('todos', 'Todos')}</div>
        ${idusuario ? '<p><a href="#reportes">← Ver todos los reportes</a></p>' : ''}` +
        (filas.length ? filas.map((r) => `<div class="panel">
          <div class="etiquetas"><span class="etiqueta ${esc(r.estado)}">${esc(r.estado)}</span><span class="etiqueta">${esc(r.motivo)}</span></div>
          <h3 style="margin-top:.6rem">${r.tipo === 'publicacion' ? 'Publicación «' + esc(r.nombre_articulo) + '»' : 'Perfil de ' + nombreDe(r.objetivo_nombre, r.objetivo_apellido)}</h3>
          <p class="meta" style="margin:0">Reportó ${nombreDe(r.reportante_nombre, r.reportante_apellido)} · ${fechaCorta(r.fecha)} · Persona involucrada: ${nombreDe(r.objetivo_nombre, r.objetivo_apellido)}</p>
          ${r.comentario ? `<p style="margin:.6rem 0 0">${esc(r.comentario)}</p>` : ''}
          <div class="acciones">
            <a class="boton claro chico" href="${r.tipo === 'publicacion' ? '/publicacion.html?id=' + r.idpublicacion : '/perfil.html?id=' + r.idusuario_reportado}">Ver</a>
            ${r.estado === 'pendiente' ? `
              ${r.tipo === 'publicacion' && r.pub_disponibilidad !== 'eliminada' ? `<button class="boton peligro chico" data-borrar="${r.idpublicacion}">Eliminar publicación</button>` : ''}
              <button class="boton chico" data-sancionar="${r.idreporte}" data-usuario="${r.idobjetivo}">Sancionar</button>
              <button class="boton claro chico" data-cerrar="resolver" data-id="${r.idreporte}">Marcar resuelto</button>
              <button class="boton claro chico" data-cerrar="desestimar" data-id="${r.idreporte}">Desestimar</button>` : ''}
          </div></div>`).join('') : '<p class="vacio">No hay reportes en esta lista.</p>');
      vista.querySelector('.pestanas').addEventListener('click', (e) => {
        const b = e.target.closest('[data-estado]'); if (b) { estadoReportes = b.dataset.estado; reportes(idusuario); }
      });
    } catch (error) { mostrarError(error); }
  }

  // ================= USUARIOS REPORTADOS =================
  async function reportados() {
    titular('Usuarios reportados', 'Quién ha sido reportado y cuántas veces. Empieza por los que tienen reportes pendientes.');
    try {
      const filas = await API.get('/admin/usuarios-reportados');
      vista.innerHTML = filas.length ? `<div class="panel tabla-scroll"><table><thead><tr><th>Persona</th><th>Correo</th><th>Reportes</th><th>Pendientes</th><th>Sanciones</th><th>Cuenta</th><th></th></tr></thead><tbody>` +
        filas.map((u) => `<tr><td><a href="/perfil.html?id=${u.idusuario}">${nombreDe(u.nombre, u.apellido)}</a></td><td>${esc(u.correo)}</td>
          <td>${u.total_reportes}</td><td>${Number(u.pendientes) > 0 ? `<strong>${u.pendientes}</strong>` : '0'}</td><td>${u.total_sanciones}</td>
          <td>${u.activo ? '<span class="etiqueta disponible">Activa</span>' : '<span class="etiqueta baneo">Inactiva</span>'}</td>
          <td><div class="acciones" style="margin:0"><a class="boton claro chico" href="#reportes/${u.idusuario}">Ver reportes</a>
          <button class="boton chico" data-sancionar="" data-usuario="${u.idusuario}">Sancionar</button></div></td></tr>`).join('') + '</tbody></table></div>'
        : '<p class="vacio">Nadie ha sido reportado todavía.</p>';
    } catch (error) { mostrarError(error); }
  }

  // ================= SANCIONES =================
  async function sanciones() {
    titular('Sanciones', 'Historial de advertencias, suspensiones y baneos. Si una fue un error, puedes revertirla.');
    try {
      const filas = await API.get('/admin/sanciones');
      vista.innerHTML = filas.length ? `<div class="panel tabla-scroll"><table><thead><tr><th>Fecha</th><th>Persona</th><th>Tipo</th><th>Estado</th><th>Motivo</th><th>Hasta</th><th></th></tr></thead><tbody>` +
        filas.map((s) => `<tr><td>${fechaCorta(s.fecha)}</td><td><a href="/perfil.html?id=${s.idusuario}">${nombreDe(s.nombre, s.apellido)}</a></td>
          <td><span class="etiqueta ${esc(s.tipo)}">${ETIQUETAS.sancion[s.tipo]}</span></td>
          <td><span class="etiqueta ${esc(s.estado)}">${ETIQUETAS.estadoSancion[s.estado]}</span></td>
          <td>${esc(s.motivo)}</td><td>${fechaCorta(s.fecha_fin)}</td>
          <td>${s.estado === 'vigente' ? `<button class="boton claro chico" data-revertir="${s.idsancion}">Revertir</button>` : s.fecha_revertida ? `<span class="meta">Revertida ${fechaCorta(s.fecha_revertida)}</span>` : ''}</td></tr>`).join('') + '</tbody></table></div>'
        : '<p class="vacio">Aún no hay sanciones.</p>';
    } catch (error) { mostrarError(error); }
  }

  // ================= APELACIONES =================
  async function apelaciones() {
    titular('Apelaciones', 'Personas sancionadas que explican por qué creen que fue un error.');
    try {
      const filas = await API.get('/admin/apelaciones?estado=pendiente');
      vista.innerHTML = filas.length ? filas.map((a) => `<div class="panel">
        <div class="etiquetas"><span class="etiqueta ${esc(a.tipo)}">${ETIQUETAS.sancion[a.tipo]}</span><span class="meta">${fechaCorta(a.fecha)}</span></div>
        <h3 style="margin-top:.6rem"><a href="/perfil.html?id=${a.idusuario}">${nombreDe(a.nombre, a.apellido)}</a> <span class="meta">· ${esc(a.correo)}</span></h3>
        <p class="meta" style="margin:0">Sanción: ${esc(a.sancion_motivo)} (${fechaCorta(a.sancion_fecha)})</p>
        <div class="bloque-mensaje"><small>Explicación de la persona</small><p style="margin:.2rem 0 0;white-space:pre-wrap">${esc(a.mensaje)}</p></div>
        <div class="acciones"><button class="boton chico" data-apelar="aceptar" data-id="${a.idapelacion}">Aceptar y revertir sanción</button>
        <button class="boton claro chico" data-apelar="rechazar" data-id="${a.idapelacion}">Rechazar</button></div></div>`).join('')
        : '<p class="vacio">No hay apelaciones pendientes.</p>';
    } catch (error) { mostrarError(error); }
  }

  // ================= PUBLICACIONES (todas) =================
  async function publicaciones() {
    titular('Publicaciones', 'Todas las publicaciones, aunque no tengan reportes ni sanciones.');
    try {
      const cats = await API.get('/catalogos/categorias');
      const p = new URLSearchParams({ pagina: paginaPubs });
      Object.entries(filtrosPubs).forEach(([k, v]) => { if (v) p.set(k, v); });
      const r = await API.get('/admin/publicaciones?' + p.toString());
      vista.innerHTML = `<form id="filtros-pubs" class="panel" novalidate><div class="fila">
          <div><label for="fp-q">Buscar</label><input id="fp-q" maxlength="100" value="${esc(filtrosPubs.q)}" placeholder="Artículo o nombre del dueño"></div>
          <div><label for="fp-estado">Estado</label><select id="fp-estado"><option value="">Todos</option><option value="disponible">Disponibles</option><option value="no_disponible">No disponibles</option><option value="eliminada">Eliminadas</option></select></div>
          <div><label for="fp-cat">Categoría</label><select id="fp-cat"></select></div></div>
          <div class="acciones"><button class="boton chico" type="submit">Filtrar</button></div></form>
        <p class="meta">${r.total} publicaciones</p>
        <div class="cuadricula">${r.publicaciones.map((x) => `<div class="tarjeta">
          <a href="/publicacion.html?id=${x.idpublicacion}" class="foto"><img src="${fotoUrl(x.foto)}" alt="" loading="lazy"></a>
          <div class="cuerpo"><div class="etiquetas"><span class="etiqueta ${esc(x.modalidad)}">${ETIQUETAS.modalidad[x.modalidad]}</span><span class="etiqueta ${esc(x.disponibilidad)}">${ETIQUETAS.disponibilidad[x.disponibilidad]}</span></div>
            <h3>${esc(x.nombre_articulo)}</h3>
            <p class="meta">${esc(x.categoria)} · ${nombreDe(x.dueno_nombre, x.dueno_apellido)}${Number(x.total_reportes) ? ' · <strong>' + x.total_reportes + ' reportes</strong>' : ''}</p>
            <div class="acciones" style="margin:.3rem 0 0"><a class="boton claro chico" href="/publicacion.html?id=${x.idpublicacion}">Ver</a>
            ${x.disponibilidad !== 'eliminada' ? `<button class="boton peligro chico" data-borrar="${x.idpublicacion}">Eliminar</button>` : ''}</div></div></div>`).join('')}</div>
        ${r.publicaciones.length ? '' : '<p class="vacio">No hay publicaciones con esos filtros.</p>'}
        <div class="paginacion">${Math.ceil(r.total / r.porPagina) > 1 ? `<button class="boton claro chico" data-pag="-1" ${r.pagina <= 1 ? 'disabled' : ''}>Anterior</button><span class="meta">Página ${r.pagina} de ${Math.ceil(r.total / r.porPagina)}</span><button class="boton claro chico" data-pag="1" ${r.pagina >= Math.ceil(r.total / r.porPagina) ? 'disabled' : ''}>Siguiente</button>` : ''}</div>`;
      llenarSelect($('fp-cat'), cats, 'idcategoria', 'nombre', 'Todas');
      $('fp-cat').value = filtrosPubs.categoria; $('fp-estado').value = filtrosPubs.estado;
      $('filtros-pubs').addEventListener('submit', (e) => {
        e.preventDefault();
        Object.assign(filtrosPubs, { q: $('fp-q').value.trim(), estado: $('fp-estado').value, categoria: $('fp-cat').value });
        paginaPubs = 1; publicaciones();
      });
    } catch (error) { mostrarError(error); }
  }

  // ================= CATEGORÍAS =================
  async function categorias() {
    titular('Categorías', 'Qué se puede publicar y qué reglas lleva cada categoría.');
    try {
      const filas = await API.get('/catalogos/categorias');
      vista.dataset.cats = JSON.stringify(filas);
      vista.innerHTML = `<div class="acciones" style="margin:0 0 1rem"><button class="boton" data-categoria="nueva">+ Nueva categoría</button></div>
        <div class="panel tabla-scroll"><table><thead><tr><th>Categoría</th><th>Sellado</th><th>Caducidad</th><th>Publicaciones</th><th></th></tr></thead><tbody>` +
        filas.map((c) => `<tr><td><strong>${esc(c.nombre)}</strong><br><span class="meta">${esc(c.descripcion)}</span></td>
          <td>${c.requiere_sellado ? 'Sí (nuevo + caducidad)' : 'No'}</td><td>${c.permite_caducidad ? 'Sí' : '<span class="meta">No aplica</span>'}</td><td>${c.total_publicaciones}</td>
          <td><div class="acciones" style="margin:0"><button class="boton claro chico" data-categoria="${c.idcategoria}">Editar</button>
          <button class="boton claro chico" data-quitar-cat="${c.idcategoria}">Eliminar</button></div></td></tr>`).join('') + '</tbody></table></div>';
    } catch (error) { mostrarError(error); }
  }

  function dialogoCategoria(c) {
    const d = document.createElement('dialog');
    d.innerHTML = `<form method="dialog" novalidate><h2>${c ? 'Editar categoría' : 'Nueva categoría'}</h2>
      <label for="cat-nombre">Nombre</label><input id="cat-nombre" maxlength="100" value="${esc(c ? c.nombre : '')}">
      <label for="cat-desc">Descripción</label><input id="cat-desc" maxlength="255" value="${esc(c ? c.descripcion : '')}">
      <label style="font-weight:500"><input type="checkbox" id="cat-sellado" ${c && c.requiere_sellado ? 'checked' : ''}> Producto sellado (debe ser nuevo y llevar caducidad)</label>
      <label style="font-weight:500"><input type="checkbox" id="cat-caduca" ${!c || c.permite_caducidad ? 'checked' : ''}> Maneja fecha de caducidad</label>
      <p class="ayuda">Si desmarcas la caducidad, el campo queda bloqueado al publicar (ropa, accesorios, apoyos…).</p>
      <div class="acciones"><button class="boton" type="submit">Guardar</button><button class="boton claro" type="button" id="cat-cancelar">Cancelar</button></div></form>`;
    document.body.appendChild(d);
    d.showModal();
    const sellado = d.querySelector('#cat-sellado'); const caduca = d.querySelector('#cat-caduca');
    sellado.addEventListener('change', () => { if (sellado.checked) caduca.checked = true; }); // sellado siempre lleva caducidad
    d.querySelector('#cat-cancelar').addEventListener('click', () => { d.close(); d.remove(); });
    d.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const nombre = d.querySelector('#cat-nombre'); const desc = d.querySelector('#cat-desc');
      if (!revisar([[nombre, Validar.titulo(nombre.value, 'El nombre', 3, 100)], [desc, Validar.texto(desc.value, 'La descripción', 3, 255)]])) return;
      const cuerpo = { nombre: nombre.value, descripcion: desc.value, requiere_sellado: sellado.checked, permite_caducidad: caduca.checked };
      try {
        if (c) await API.put('/admin/categorias/' + c.idcategoria, cuerpo); else await API.post('/admin/categorias', cuerpo);
        aviso('Categoría guardada'); d.close(); d.remove(); categorias();
      } catch (error) { mostrarError(error); }
    });
  }

  // ================= Sancionar (ventana) =================
  function dialogoSancion(idusuario, idreporte) {
    const d = document.createElement('dialog');
    d.innerHTML = `<form method="dialog" novalidate><h2>Aplicar sanción</h2>
      <label for="s-tipo">Tipo</label>
      <select id="s-tipo"><option value="advertencia">Advertencia</option><option value="suspension">Suspensión</option><option value="baneo">Baneo (desactiva la cuenta)</option></select>
      <div id="s-dias-caja" hidden><label for="s-dias">Días de suspensión</label><input id="s-dias" type="number" min="1" max="365" value="7"></div>
      <label for="s-motivo">Motivo (la persona lo verá)</label><textarea id="s-motivo" maxlength="255"></textarea>
      <div class="acciones"><button class="boton peligro" type="submit">Aplicar</button><button class="boton claro" type="button" id="s-cancelar">Cancelar</button></div></form>`;
    document.body.appendChild(d);
    d.showModal();
    d.querySelector('#s-tipo').addEventListener('change', (e) => { d.querySelector('#s-dias-caja').hidden = e.target.value !== 'suspension'; });
    d.querySelector('#s-cancelar').addEventListener('click', () => { d.close(); d.remove(); });
    d.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const motivo = d.querySelector('#s-motivo');
      if (!revisar([[motivo, Validar.texto(motivo.value, 'El motivo', 10, 255)]])) return;
      try {
        await API.post('/admin/sanciones', { idusuario, idreporte: idreporte || null, tipo: d.querySelector('#s-tipo').value, motivo: motivo.value, dias: d.querySelector('#s-dias').value });
        aviso('Sanción aplicada'); d.close(); d.remove(); ir();
      } catch (error) { mostrarError(error); }
    });
  }

  function dialogoRespuesta(titulo, obligatoria, alEnviar) {
    const d = document.createElement('dialog');
    d.innerHTML = `<form method="dialog" novalidate><h2>${esc(titulo)}</h2>
      <label for="r-texto">Respuesta para la persona${obligatoria ? '' : ' (opcional)'}</label><textarea id="r-texto" maxlength="255"></textarea>
      <div class="acciones"><button class="boton" type="submit">Enviar</button><button class="boton claro" type="button" id="r-cancelar">Cancelar</button></div></form>`;
    document.body.appendChild(d);
    d.showModal();
    d.querySelector('#r-cancelar').addEventListener('click', () => { d.close(); d.remove(); });
    d.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const t = d.querySelector('#r-texto');
      if ((obligatoria || t.value.trim()) && !revisar([[t, Validar.texto(t.value, 'La respuesta', obligatoria ? 5 : 1, 255)]])) return;
      try { await alEnviar(t.value); d.close(); d.remove(); } catch (error) { mostrarError(error); }
    });
  }

  // ================= Un solo "oyente" para todos los botones =================
  vista.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    try {
      if (b.dataset.cerrar) {
        await API.patch(`/admin/reportes/${b.dataset.id}/${b.dataset.cerrar}`); aviso('Reporte actualizado'); ir();
      } else if (b.dataset.borrar) {
        if (!confirm('¿Eliminar esta publicación por moderación?')) return;
        await API.del('/publicaciones/' + b.dataset.borrar); aviso('Publicación eliminada'); ir();
      } else if (b.dataset.sancionar !== undefined) {
        dialogoSancion(Number(b.dataset.usuario), Number(b.dataset.sancionar) || null);
      } else if (b.dataset.revertir) {
        if (!confirm('¿Revertir esta sanción? Si era un baneo, la cuenta se reactiva.')) return;
        await API.patch(`/admin/sanciones/${b.dataset.revertir}/revertir`); aviso('Sanción revertida'); ir();
      } else if (b.dataset.apelar === 'aceptar') {
        dialogoRespuesta('Aceptar apelación', false, async (t) => { await API.patch(`/admin/apelaciones/${b.dataset.id}/aceptar`, { respuesta: t }); aviso('Sanción revertida'); ir(); });
      } else if (b.dataset.apelar === 'rechazar') {
        dialogoRespuesta('Rechazar apelación', true, async (t) => { await API.patch(`/admin/apelaciones/${b.dataset.id}/rechazar`, { respuesta: t }); aviso('Apelación rechazada'); ir(); });
      } else if (b.dataset.categoria) {
        const lista = JSON.parse(vista.dataset.cats || '[]');
        dialogoCategoria(b.dataset.categoria === 'nueva' ? null : lista.find((c) => String(c.idcategoria) === b.dataset.categoria));
      } else if (b.dataset.quitarCat) {
        if (!confirm('¿Eliminar esta categoría? Solo se puede si nadie la ha usado.')) return;
        await API.del('/admin/categorias/' + b.dataset.quitarCat); aviso('Categoría eliminada'); categorias();
      } else if (b.dataset.pag) {
        paginaPubs += Number(b.dataset.pag); publicaciones();
      }
    } catch (error) { mostrarError(error); }
  });

  ir();
})();
