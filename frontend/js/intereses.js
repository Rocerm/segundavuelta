// Elegir las categorías que le interesan al usuario. Sirve para intereses.html (al crear la cuenta) y para el bloque de ajustes.html.
// data-volver="/index.html" en el formulario = a dónde ir después de guardar (vacío = quedarse).
(async function () {
  if (!Auth.token()) return;
  const form = document.getElementById('form-intereses');
  const caja = document.getElementById('lista-categorias');
  if (!form) return;
  const contador = document.getElementById('contador-int');
  const actualizar = () => {
    const n = caja.querySelectorAll('input:checked').length;
    contador.textContent = `${n} ${n === 1 ? 'interés seleccionado' : 'intereses seleccionados'}`;
  };

  // Si el admin abre esta página por error, no hay nada que hacer (el admin no tiene intereses).
  if (Auth.usuario().rol === 'admin') return;

  try {
    const [categorias, mios] = await Promise.all([API.get('/catalogos/categorias'), API.get('/perfiles/yo/intereses')]);
    caja.innerHTML = categorias.map((c) => `
      <label class="opcion"><input type="checkbox" value="${c.idcategoria}" ${mios.includes(c.idcategoria) ? 'checked' : ''}>
        <span class="contenido">${iconoCategoria(c.nombre)}<b>${esc(c.nombre)}</b><span>${esc(c.descripcion)}</span></span>
        <span class="marca-check">${icono('check', 14)}</span></label>`).join('');
    caja.addEventListener('change', actualizar);
    actualizar();
    // Bienvenida con el nombre si viene de crear la cuenta
    const titulo = document.getElementById('titulo-int');
    if (titulo && parametro('nuevo')) titulo.textContent = `¿Qué te gustaría encontrar, ${Auth.usuario().nombre}?`;
  } catch (error) { return mostrarError(error); }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ids = [...caja.querySelectorAll('input:checked')].map((i) => Number(i.value));
    try {
      await API.put('/perfiles/yo/intereses', { categorias: ids });
      aviso('Intereses guardados');
      if (form.dataset.volver) setTimeout(() => { location.href = form.dataset.volver; }, 600);
    } catch (error) { mostrarError(error); }
  });
})();
