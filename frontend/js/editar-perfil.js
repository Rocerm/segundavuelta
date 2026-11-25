// editar-perfil.html: foto, nombre, apellido y biografía.
(async function () {
  if (!Auth.token()) return;
  const $ = (id) => document.getElementById(id);
  let perfil;
  const pintarFoto = (p) => { $('foto-actual').innerHTML = avatarHtml(p.foto_perfil, p.nombre, p.apellido, 'grande'); };

  try {
    perfil = await API.get('/perfiles/yo');
    $('nombre').value = perfil.nombre;
    $('apellido').value = perfil.apellido;
    $('biografia').value = perfil.biografia || '';
    pintarFoto(perfil);
  } catch (error) { return mostrarError(error); }

  // Solo letras en nombre y apellido (se quitan números y símbolos mientras escribe).
  ['nombre', 'apellido'].forEach((id) => $(id).addEventListener('input', () => { $(id).value = $(id).value.replace(/[^\p{L} '’-]/gu, ''); }));
  const contar = () => { $('cuenta-bio').textContent = `${$('biografia').value.length} / 255`; };
  $('biografia').addEventListener('input', contar);
  contar();

  // Al elegir una foto se sube enseguida.
  $('foto').addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type) || archivo.size > 3 * 1024 * 1024) {
      return aviso('La foto debe ser JPG, PNG o WEBP de máximo 3 MB', 'error');
    }
    const datos = new FormData();
    datos.append('foto', archivo);
    try {
      const resp = await fetch(urlApi('/perfiles/yo/foto'), { method: 'POST', headers: { Authorization: 'Bearer ' + Auth.token() }, body: datos });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || 'No se pudo subir la foto');
      perfil.foto_perfil = json.foto_perfil;
      pintarFoto(perfil);
      aviso('Foto actualizada');
    } catch (error) { mostrarError(error); }
  });

  $('form-perfil').addEventListener('submit', async (e) => {
    e.preventDefault();
    const bio = $('biografia').value.trim();
    if (!revisar([
      [$('nombre'), Validar.nombre($('nombre').value, 'El nombre')],
      [$('apellido'), Validar.nombre($('apellido').value, 'El apellido')],
      [$('biografia'), bio ? Validar.texto(bio, 'La biografía', 1, 255) : null],
    ])) return;
    try {
      const p = await API.put('/perfiles/yo', { nombre: $('nombre').value, apellido: $('apellido').value, biografia: bio });
      aviso('Perfil guardado');
      document.dispatchEvent(new CustomEvent('layout-listo', { detail: p }));
    } catch (error) { mostrarError(error); }
  });
})();
