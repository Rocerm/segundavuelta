// index.html (Inicio) y buscar.html (Buscador). Las dos páginas comparten la lista de artículos y la paginación.
(async function () {
  if (!Auth.token()) return;
  const modo = document.body.dataset.pagina; // 'inicio' | 'buscar'
  const lista = document.getElementById('lista');
  const paginacion = document.getElementById('paginacion');
  const titulo = document.getElementById('titulo-lista');
  let pagina = 1;
  let categoriaActiva = ''; // solo en el buscador
  let usarIntereses = false; // solo en el inicio

  // ---------- Pide y dibuja una página de artículos ----------
  async function cargar() {
    const p = new URLSearchParams({ excluirPropias: '1', pagina });
    if (modo === 'inicio' && usarIntereses) p.set('intereses', '1');
    if (modo === 'buscar') {
      const q = document.getElementById('f-q').value.trim();
      if (q) p.set('q', q);
      if (categoriaActiva) p.set('categoria', categoriaActiva);
      for (const [id, campo] of [['f-modalidad', 'modalidad'], ['f-alcaldia', 'alcaldia'], ['f-condicion', 'condicion']]) {
        if (document.getElementById(id).value) p.set(campo, document.getElementById(id).value);
      }
    }
    try {
      const r = await API.get('/publicaciones?' + p.toString());
      // Inicio: si sus intereses no tienen artículos todavía, se muestra todo para que no vea la página vacía.
      if (modo === 'inicio' && usarIntereses && r.total === 0) {
        usarIntereses = false;
        titulo.textContent = 'Recién publicados';
        return cargar();
      }
      lista.innerHTML = r.publicaciones.length
        ? r.publicaciones.map(tarjetaPublicacion).join('')
        : '<p class="vacio" style="grid-column:1/-1">No encontramos artículos con esos filtros.</p>';
      const paginas = Math.max(1, Math.ceil(r.total / r.porPagina));
      paginacion.innerHTML = paginas > 1
        ? `<button class="boton claro chico" data-pag="-1" ${pagina <= 1 ? 'disabled' : ''}>Anterior</button>
           <span class="meta">Página ${pagina} de ${paginas}</span>
           <button class="boton claro chico" data-pag="1" ${pagina >= paginas ? 'disabled' : ''}>Siguiente</button>`
        : '';
    } catch (error) { mostrarError(error); }
  }
  paginacion.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pag]');
    if (!b) return;
    pagina += Number(b.dataset.pag);
    cargar();
    window.scrollTo({ top: 0 });
  });

  // ---------- INICIO ----------
  if (modo === 'inicio') {
    const u = Auth.usuario();
    document.getElementById('saludo').textContent = `Hola, ${u.nombre}. Encuentra eso que necesitas y comparte lo que ya no usas.`;
    document.addEventListener('layout-listo', (e) => { document.getElementById('zona-lista').innerHTML = icono('pin', 16) + ' Zona: ' + esc(e.detail.alcaldia); });
    try {
      const [mios, categorias] = await Promise.all([API.get('/perfiles/yo/intereses'), API.get('/catalogos/categorias')]);
      const nombres = categorias.filter((c) => mios.includes(c.idcategoria));
      usarIntereses = nombres.length > 0;
      document.getElementById('para-ti').innerHTML = (usarIntereses
        ? `${icono('filtro', 18)}<span class="meta">Para ti</span>${nombres.map((c) => `<span class="chip lavanda">${esc(c.nombre)}</span>`).join('')}`
        : '<span class="meta">Aún no eliges intereses.</span>') +
        `<a href="/intereses.html">${usarIntereses ? 'Editar intereses' : 'Elegir intereses'}</a>`;
      titulo.textContent = usarIntereses ? 'Sugeridos para ti' : 'Recién publicados';
    } catch (error) { mostrarError(error); }
    return cargar();
  }

  // ---------- BUSCADOR ----------
  document.querySelector('.busqueda').insertAdjacentHTML('afterbegin', icono('buscar', 20));
  const botonLimpiar = document.getElementById('ver-todo');
  const hayFiltros = () => !!(document.getElementById('f-q').value.trim() || categoriaActiva ||
    ['f-modalidad', 'f-alcaldia', 'f-condicion'].some((id) => document.getElementById(id).value));

  function recargar() {
    pagina = 1;
    botonLimpiar.hidden = !hayFiltros();
    titulo.textContent = hayFiltros() ? 'Resultados' : 'Recién publicados';
    cargar();
  }

  try {
    const [categorias, alcaldias] = await Promise.all([API.get('/catalogos/categorias'), API.get('/catalogos/alcaldias')]);
    llenarSelect(document.getElementById('f-alcaldia'), alcaldias, 'idalcaldia', 'nombre', 'Todas');
    const caja = document.getElementById('categorias');
    caja.innerHTML = categorias.map((c) => `<button type="button" class="categoria-enlace" data-cat="${c.idcategoria}" aria-pressed="false">
      <span><b>${esc(c.nombre)}</b><span>${esc(c.descripcion)}</span></span>${iconoCategoria(c.nombre)}</button>`).join('');
    caja.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      categoriaActiva = categoriaActiva === b.dataset.cat ? '' : b.dataset.cat; // clic otra vez = quitar
      caja.querySelectorAll('[data-cat]').forEach((x) => { const on = x.dataset.cat === categoriaActiva; x.classList.toggle('activo', on); x.setAttribute('aria-pressed', on); });
      recargar();
    });
  } catch (error) { mostrarError(error); }

  let espera;
  document.getElementById('f-q').addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(recargar, 350); }); // espera a que termine de escribir
  document.getElementById('filtros').addEventListener('submit', (e) => { e.preventDefault(); recargar(); });
  ['f-modalidad', 'f-alcaldia', 'f-condicion'].forEach((id) => document.getElementById(id).addEventListener('change', recargar));
  botonLimpiar.addEventListener('click', () => {
    document.getElementById('filtros').reset();
    categoriaActiva = '';
    document.querySelectorAll('[data-cat]').forEach((x) => { x.classList.remove('activo'); x.setAttribute('aria-pressed', 'false'); });
    recargar();
  });
  cargar();
})();
