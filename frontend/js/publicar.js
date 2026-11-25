// nueva-publicacion.html: crear una publicación, o editarla si la URL trae ?editar=ID.
(async function () {
  if (!Auth.token()) return;
  const $ = (id) => document.getElementById(id);
  const form = $('form-pub');
  const idEditar = parametro('editar');
  let categorias = [];
  let fotoQuitada = false;
  document.querySelector('aside.panel span').innerHTML = icono('escudo', 32);

  try {
    const [cats, alcaldias] = await Promise.all([API.get('/catalogos/categorias'), API.get('/catalogos/alcaldias')]);
    categorias = cats;
    llenarSelect($('idcategoria'), cats, 'idcategoria', 'nombre');
    llenarSelect($('idalcaldia'), alcaldias, 'idalcaldia', 'nombre');
    $('idalcaldia').value = Auth.usuario().idalcaldia; // por defecto, la alcaldía del usuario
  } catch (error) { return mostrarError(error); }

  // Reglas de la categoría (el servidor las vuelve a validar; esto solo ayuda a llenar bien el formulario):
  //  - requiere_sellado → condición "nuevo" y caducidad obligatoria.
  //  - permite_caducidad = false → el campo de caducidad se BLOQUEA por completo (ropa, accesorios, apoyos).
  function aplicarReglas() {
    const cat = categorias.find((c) => String(c.idcategoria) === $('idcategoria').value) || {};
    const sellado = !!cat.requiere_sellado;
    const sinCaducidad = !cat.permite_caducidad;
    $('nota-sellado').hidden = !sellado;
    $('condicion').disabled = sellado;
    if (sellado) $('condicion').value = 'nuevo';
    $('caducidad').disabled = sinCaducidad;
    if (sinCaducidad) $('caducidad').value = '';
    $('caducidad').min = new Date().toISOString().slice(0, 10);
    $('caducidad-nota').textContent = sinCaducidad ? '(no aplica en esta categoría)' : sellado ? '(obligatoria)' : '(si aplica)';
  }
  $('idcategoria').addEventListener('change', aplicarReglas);
  aplicarReglas();

  // Vista previa de la foto
  function vistaPrevia(url) {
    $('vista').innerHTML = url ? `<img src="${esc(url)}" alt="Vista previa">` : '<span class="meta">Sin foto</span>';
    $('quitar-foto').hidden = !url;
  }
  $('foto').addEventListener('change', () => {
    const f = $('foto').files[0];
    if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type) || f.size > 3 * 1024 * 1024) {
      $('foto').value = '';
      return marcarFoto('La foto debe ser JPG, PNG o WEBP de máximo 3 MB');
    }
    marcarFoto(null);
    fotoQuitada = false;
    vistaPrevia(URL.createObjectURL(f));
  });
  $('quitar-foto').addEventListener('click', () => { $('foto').value = ''; fotoQuitada = true; vistaPrevia(null); });
  function marcarFoto(error) { $('err-foto').textContent = error || ''; $('err-foto').hidden = !error; return !!error; }

  // Modo edición: se rellena el formulario con lo que ya tiene.
  if (idEditar) {
    $('titulo').textContent = 'Editar publicación';
    $('foto-nota').textContent = 'Si no eliges otra, se conserva la foto actual.';
    form.querySelector('button[type=submit]').textContent = 'Guardar cambios';
    try {
      const p = await API.get('/publicaciones/' + idEditar);
      $('nombre_articulo').value = p.nombre_articulo;
      $('descripcion').value = p.descripcion;
      $('idcategoria').value = p.idcategoria;
      $('idalcaldia').value = p.idalcaldia;
      $('condicion').value = p.condicion;
      form.querySelector(`input[name=modalidad][value=${p.modalidad}]`).checked = true;
      aplicarReglas();
      $('caducidad').value = fechaCorta(p.caducidad);
      vistaPrevia(urlArchivo(p.foto));
    } catch (error) { mostrarError(error); }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hayFoto = !!$('foto').files[0] || (idEditar && !fotoQuitada);
    const sellado = !!(categorias.find((c) => String(c.idcategoria) === $('idcategoria').value) || {}).requiere_sellado;
    const bien = revisar([
      [$('nombre_articulo'), Validar.titulo($('nombre_articulo').value, 'El nombre del artículo', 3, 100)],
      [$('descripcion'), Validar.texto($('descripcion').value, 'La descripción', 10, 2000)],
      [$('caducidad'), sellado && !$('caducidad').value ? 'Esta categoría exige fecha de caducidad' : null],
    ]);
    if (!bien) return;
    if (!hayFoto) return marcarFoto('La foto es obligatoria');

    // Un campo deshabilitado no se envía, por eso se arma el FormData a mano.
    const datos = new FormData();
    datos.append('nombre_articulo', $('nombre_articulo').value);
    datos.append('descripcion', $('descripcion').value);
    datos.append('idcategoria', $('idcategoria').value);
    datos.append('idalcaldia', $('idalcaldia').value);
    datos.append('condicion', $('condicion').value);
    datos.append('modalidad', form.querySelector('input[name=modalidad]:checked').value);
    if ($('caducidad').value && !$('caducidad').disabled) datos.append('caducidad', $('caducidad').value);
    if ($('foto').files[0]) datos.append('foto', $('foto').files[0]);

    // Con fotos se manda multipart (no JSON), por eso aquí se usa fetch directo con el mismo token.
    try {
      const resp = await fetch(urlApi('/publicaciones' + (idEditar ? '/' + idEditar : '')), {
        method: idEditar ? 'PUT' : 'POST', headers: { Authorization: 'Bearer ' + Auth.token() }, body: datos,
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(json.error || 'Error ' + resp.status);
      location.href = '/publicacion.html?id=' + json.idpublicacion;
    } catch (error) { mostrarError(error); }
  });
})();
