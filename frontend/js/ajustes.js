// ajustes.html: nombre y apellido, alcaldía, contraseña, intereses (los maneja intereses.js), avisos de la cuenta,
// cerrar sesión y eliminar cuenta. El admin solo ve nombre/apellido, contraseña y cerrar sesión.
(async function () {
  if (!Auth.token()) return;
  const $ = (id) => document.getElementById(id);
  const esAdmin = Auth.usuario().rol === 'admin';
  if (esAdmin) document.querySelectorAll('[data-solo="usuario"]').forEach((e) => e.remove());

  let perfil;
  try {
    perfil = await API.get('/perfiles/yo');
    $('a-nombre').value = perfil.nombre;
    $('a-apellido').value = perfil.apellido;
    if (!esAdmin) {
      llenarSelect($('a-alcaldia'), await API.get('/catalogos/alcaldias'), 'idalcaldia', 'nombre');
      $('a-alcaldia').value = perfil.idalcaldia;
      pintarAvisos();
    }
  } catch (error) { return mostrarError(error); }
  activarOjos();

  ['a-nombre', 'a-apellido'].forEach((id) => $(id).addEventListener('input', () => { $(id).value = $(id).value.replace(/[^\p{L} '’-]/gu, ''); }));

  // ----- Avisos: advertencias, suspensiones y baneos que recibió la cuenta -----
  async function pintarAvisos() {
    try {
      const lista = await API.get('/perfiles/yo/avisos');
      $('avisos-cuenta').innerHTML = lista.length
        ? lista.map((s) => `<div class="item-lista">
            <span class="etiqueta ${esc(s.tipo)}">${ETIQUETAS.sancion[s.tipo]}</span>
            <span class="etiqueta ${esc(s.estado)}">${ETIQUETAS.estadoSancion[s.estado]}</span>
            <p style="margin:.4rem 0 0">${esc(s.motivo)}</p>
            <p class="meta" style="margin:0">${fechaCorta(s.fecha)}${s.fecha_fin ? ' · hasta ' + fechaCorta(s.fecha_fin) : ''}${s.fecha_revertida ? ' · revertida el ' + fechaCorta(s.fecha_revertida) : ''}</p></div>`).join('')
        : '<p class="meta">No tienes avisos. ¡Gracias por cuidar la comunidad!</p>';
    } catch (error) { mostrarError(error); }
  }

  // ----- Datos personales -----
  $('form-datos').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!revisar([[$('a-nombre'), Validar.nombre($('a-nombre').value, 'El nombre')], [$('a-apellido'), Validar.nombre($('a-apellido').value, 'El apellido')]])) return;
    const cuerpo = { nombre: $('a-nombre').value, apellido: $('a-apellido').value };
    if (!esAdmin) cuerpo.idalcaldia = $('a-alcaldia').value;
    try {
      const p = await API.put('/perfiles/yo', cuerpo);
      aviso('Datos guardados');
      document.dispatchEvent(new CustomEvent('layout-listo', { detail: p }));
      const zona = document.getElementById('zona-usuario'); if (zona) zona.textContent = 'Zona: ' + p.alcaldia;
    } catch (error) { mostrarError(error); }
  });

  // ----- Contraseña -----
  $('form-clave').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ok = revisar([
      [$('c-actual'), $('c-actual').value ? null : 'Escribe tu contraseña actual'],
      [$('c-nueva'), Validar.contrasena($('c-nueva').value, 'La contraseña nueva')],
      [$('c-confirmar'), $('c-confirmar').value === $('c-nueva').value ? null : 'Las contraseñas no coinciden'],
    ]);
    if (!ok) return;
    try {
      await API.post('/perfiles/yo/contrasena', { actual: $('c-actual').value, nueva: $('c-nueva').value });
      aviso('Contraseña actualizada');
      e.target.reset();
    } catch (error) { mostrarError(error); }
  });

  // ----- Sesión -----
  $('salir').addEventListener('click', Auth.cerrarSesion);
  const eliminar = $('eliminar');
  if (eliminar) eliminar.addEventListener('click', async () => {
    if (!confirm('Tu cuenta se desactivará y tus publicaciones dejarán de verse. ¿Seguro?')) return;
    try {
      await API.del('/perfiles/yo');
      Auth.limpiar();
      location.href = '/login.html';
    } catch (error) { mostrarError(error); }
  });
})();
