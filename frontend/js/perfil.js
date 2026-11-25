// perfil.html (wireframe 10): mi perfil (sin ?id) o el de otra persona (?id=N). El admin solo ve perfiles ajenos.
(async function () {
  if (!Auth.token()) return;
  const yo = Auth.usuario();
  const esAdmin = yo.rol === 'admin';
  const idParam = parametro('id');
  if (esAdmin && !idParam) { location.replace('/admin.html'); return; } // el admin no tiene perfil propio
  const id = idParam ? Number(idParam) : yo.idusuario;
  const esMio = id === yo.idusuario;
  const ficha = document.getElementById('ficha');
  const miembroDesde = (t) => new Date(String(t).replace(' ', 'T')).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });

  // ---------- Ficha ----------
  try {
    const p = await API.get('/perfiles/' + (esMio ? 'yo' : id));
    if (!esMio) document.getElementById('titulo-perfil').textContent = nombreCompleto(p.nombre, p.apellido);
    ficha.innerHTML = `<div class="perfil-cabecera">
        ${avatarHtml(p.foto_perfil, p.nombre, p.apellido, 'grande')}
        <div class="datos">
          <h2 style="margin:0;font-size:1.6rem">${esc(nombreCompleto(p.nombre, p.apellido))}</h2>
          <p class="meta" style="margin:.2rem 0">${esc(p.alcaldia)}, Ciudad de México · Miembro desde ${esc(miembroDesde(p.fecha_registro))}</p>
          <p style="margin:.4rem 0 0">${p.biografia ? esc(p.biografia) : '<span class="meta">Sin biografía.</span>'}</p>
        </div>
        <div>${esMio
          ? `<a class="boton claro" href="/editar-perfil.html">${icono('lapiz', 16)} Editar perfil</a>`
          : esAdmin
            ? `<a class="boton claro" href="/admin.html#reportes/${p.idusuario}">Ver reportes de esta persona</a>`
            : '<button class="boton claro chico" id="b-reportar">' + icono('bandera', 16) + ' Reportar perfil</button>'}</div>
      </div>
      <div class="perfil-puntos"><b>${Number(p.total_calificaciones) > 0 ? p.puntos_confianza : '—'}</b> <span class="meta">de 10 · Reputación / confianza${Number(p.total_calificaciones) > 0 ? ' (' + p.total_calificaciones + ' calificaciones)' : ''}</span></div>`;
    const reportar = document.getElementById('b-reportar');
    if (reportar) reportar.addEventListener('click', () => Reportes.abrir('perfil', id));
  } catch (error) { ficha.innerHTML = `<p class="vacio">${esc(error.message)}</p>`; return; }

  // ---------- Mis publicaciones: Activas / Finalizadas ----------
  if (esMio) {
    document.getElementById('mis-pubs').hidden = false;
    let mias = [];
    let vista = 'activas';
    const pintar = () => {
      const activas = mias.filter((p) => p.disponibilidad === 'disponible');
      const finalizadas = mias.filter((p) => p.disponibilidad === 'no_disponible');
      document.getElementById('resumen-pubs').textContent = `${activas.length} artículos activos · ${finalizadas.length} finalizados`;
      document.getElementById('filtro-pubs').innerHTML =
        `<button type="button" data-v="activas" class="${vista === 'activas' ? 'activo' : ''}">Activas · ${activas.length}</button>
         <button type="button" data-v="finalizadas" class="${vista === 'finalizadas' ? 'activo' : ''}">Finalizadas · ${finalizadas.length}</button>`;
      const mostrar = vista === 'activas' ? activas : finalizadas;
      document.getElementById('lista-pubs').innerHTML = mostrar.length
        ? mostrar.map(tarjetaPublicacion).join('')
        : `<p class="vacio" style="grid-column:1/-1">${vista === 'activas' ? 'Aún no tienes artículos activos.' : 'Todavía no tienes artículos finalizados.'}</p>`;
    };
    document.getElementById('filtro-pubs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (b) { vista = b.dataset.v; pintar(); }
    });
    try { mias = await API.get('/publicaciones/mias'); pintar(); } catch (error) { mostrarError(error); }
  } else {
    // Perfil de otra persona: solo lo que está disponible.
    document.getElementById('titulo-pubs').hidden = false;
    try {
      const r = await API.get('/publicaciones?usuario=' + id);
      document.getElementById('lista-pubs').innerHTML = r.publicaciones.length
        ? r.publicaciones.map(tarjetaPublicacion).join('')
        : '<p class="vacio" style="grid-column:1/-1">No tiene publicaciones disponibles.</p>';
    } catch (error) { mostrarError(error); }
  }

  Calificaciones.pintarRecibidas(id, document.getElementById('calificaciones'));
})();
