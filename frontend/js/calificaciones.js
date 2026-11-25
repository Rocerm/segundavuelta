// Calificaciones: formulario para calificar (solicitudes-chat.html) y lista de las recibidas (perfil.html).
const Calificaciones = {
  // Muestra lo que me falta calificar. 'despues' se ejecuta al guardar una calificación.
  async pintarPendientes(contenedor, seccion, despues) {
    let filas;
    try { filas = await API.get('/calificaciones/pendientes'); } catch (error) { return mostrarError(error); }
    seccion.hidden = filas.length === 0;
    contenedor.innerHTML = filas.map((f, i) => `
      <div class="persona" style="justify-content:space-between;margin:.5rem 0;flex-wrap:wrap">
        <span>Califica a <strong>${esc(nombreCompleto(f.evaluado_nombre, f.evaluado_apellido))}</strong> por «${esc(f.nombre_articulo)}»</span>
        <button class="boton chico" data-calificar="${i}">Calificar</button>
      </div>`).join('');
    contenedor.querySelectorAll('[data-calificar]').forEach((b) =>
      b.addEventListener('click', () => Calificaciones.abrirFormulario(filas[b.dataset.calificar], despues)));
  },

  // Ventana con los criterios de 0 a 5. La veracidad solo se pide si aplica (pide_veracidad).
  abrirFormulario(fila, despues) {
    const opciones = [0, 1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${n === 5 ? 'selected' : ''}>${n}</option>`).join('');
    const dialogo = document.createElement('dialog');
    dialogo.innerHTML = `<form method="dialog" novalidate>
      <h2>Calificar a ${esc(nombreCompleto(fila.evaluado_nombre, fila.evaluado_apellido))}</h2>
      <label for="c-punt">Puntualidad (0 a 5)</label><select id="c-punt">${opciones}</select>
      <label for="c-act">Actitud (0 a 5)</label><select id="c-act">${opciones}</select>
      ${fila.pide_veracidad ? `<label for="c-ver">Veracidad: ¿era como lo publicó? (0 a 5)</label><select id="c-ver">${opciones}</select>` : ''}
      <label for="c-com">Comentario (opcional)</label><textarea id="c-com" maxlength="255"></textarea>
      <div class="acciones"><button class="boton" type="submit">Guardar</button>
      <button class="boton claro" type="button" id="c-cancelar">Cancelar</button></div></form>`;
    document.body.appendChild(dialogo);
    dialogo.showModal();
    dialogo.querySelector('#c-cancelar').addEventListener('click', () => { dialogo.close(); dialogo.remove(); });
    dialogo.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const com = dialogo.querySelector('#c-com');
      if (com.value.trim() && !revisar([[com, Validar.texto(com.value, 'El comentario', 1, 255)]])) return;
      const ver = dialogo.querySelector('#c-ver');
      try {
        await API.post('/calificaciones', {
          idsolicitud: fila.idsolicitud,
          puntualidad: dialogo.querySelector('#c-punt').value,
          actitud: dialogo.querySelector('#c-act').value,
          veracidad: ver ? ver.value : null,
          comentario: dialogo.querySelector('#c-com').value,
        });
        aviso('Calificación guardada');
        dialogo.close(); dialogo.remove();
        if (despues) despues();
      } catch (error) { mostrarError(error); }
    });
  },

  // Lista de calificaciones que recibió una persona.
  async pintarRecibidas(idusuario, contenedor) {
    try {
      const filas = await API.get('/calificaciones/usuario/' + idusuario);
      contenedor.innerHTML = filas.length ? filas.map((c) => `
        <div class="calif">
          <strong>${esc(nombreCompleto(c.evaluador_nombre, c.evaluador_apellido))}</strong>
          <span class="meta"> · ${fechaCorta(c.fecha)}</span><br>
          <span class="meta">Puntualidad ${c.puntualidad} · Actitud ${c.actitud}${c.veracidad !== null ? ' · Veracidad ' + c.veracidad : ''}</span>
          ${c.comentario ? `<p style="margin:.2rem 0 0">${esc(c.comentario)}</p>` : ''}
        </div>`).join('') : '<p class="vacio">Aún no tiene calificaciones.</p>';
    } catch (error) { mostrarError(error); }
  },
};
