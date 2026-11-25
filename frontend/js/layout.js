// Arma el "marco" de la app alrededor del contenido de cada página: barra lateral, barra superior y pantalla de carga.
// Cada HTML solo trae su <main id="pagina"> y estos datos en <body>:
//   data-zona   = "usuario" | "admin" | "ambos"   (quién puede ver la página)
//   data-seccion = cuál enlace de la barra lateral se marca como activo
//   data-migas   = texto del final de "Comunidad / ..."
// El admin tiene su propia barra lateral (moderación) y NO ve publicar, chats ni perfil propio.
const Layout = {
  menuUsuario: [
    ['inicio', '/index.html', 'Inicio', 'inicio'],
    ['buscar', '/buscar.html', 'Buscar', 'buscar'],
    ['publicar', '/nueva-publicacion.html', 'Publicar', 'mas'],
    ['chats', '/solicitudes-chat.html', 'Chats', 'chat'],
    ['perfil', '/perfil.html', 'Perfil', 'usuario'],
  ],
  menuAdmin: [
    ['resumen', '/admin.html#resumen', 'Resumen', 'panel'],
    ['reportes', '/admin.html#reportes', 'Reportes', 'bandera'],
    ['reportados', '/admin.html#reportados', 'Usuarios reportados', 'usuarios'],
    ['sanciones', '/admin.html#sanciones', 'Sanciones', 'prohibido'],
    ['apelaciones', '/admin.html#apelaciones', 'Apelaciones', 'sobre'],
    ['publicaciones', '/admin.html#publicaciones', 'Publicaciones', 'lista'],
    ['categorias', '/admin.html#categorias', 'Categorías', 'etiqueta'],
  ],

  montar() {
    const usuario = Auth.usuario();
    if (!usuario) return;
    const zona = document.body.dataset.zona || 'usuario';
    const esAdmin = usuario.rol === 'admin';

    // Cada rol solo ve lo suyo (el servidor igual lo exige con 403).
    if (zona === 'usuario' && esAdmin) { location.replace('/admin.html'); return; }
    if (zona === 'admin' && !esAdmin) { location.replace('/index.html'); return; }

    Layout.pantallaDeCarga();

    const contenido = document.getElementById('pagina');
    const menu = esAdmin ? Layout.menuAdmin : Layout.menuUsuario;
    const seccion = document.body.dataset.seccion;
    const enlaces = menu.map(([clave, ruta, texto, ic]) =>
      `<a href="${ruta}" data-clave="${clave}" ${!esAdmin && clave === seccion ? 'class="activo" aria-current="page"' : ''}>${icono(ic)}${texto}</a>`).join('');

    const marco = document.createElement('div');
    marco.className = 'app';
    marco.innerHTML = `
      <aside class="lateral">
        <a class="marca" href="${Auth.inicio(usuario)}">${logoHtml()}<span>Segunda Vuelta</span></a>
        <nav class="menu" aria-label="Principal">${enlaces}</nav>
        <div class="comunidad" id="comunidad">${esAdmin
          ? '<strong>' + icono('escudo', 18) + 'Panel de moderación</strong>'
          : '<strong>' + icono('pin', 18) + 'Ciudad de México</strong><p id="zona-usuario"></p>'}</div>
        <div class="usuario-caja">
          <span id="avatar-lateral">${avatarHtml(usuario.foto_perfil, usuario.nombre, usuario.apellido)}</span>
          <div><b>${esc(nombreCompleto(usuario.nombre, usuario.apellido))}</b>
          <span class="meta">${esAdmin ? 'Administrador' : 'Miembro de la comunidad'}</span></div>
        </div>
      </aside>
      <div class="principal">
        <header class="barra">
          <div class="migas">${esAdmin ? 'Moderación' : 'Comunidad'} / <strong id="miga-actual">${esc(document.body.dataset.migas || '')}</strong></div>
          <a class="boton-ajustes ${seccion === 'ajustes' ? 'activo' : ''}" href="/ajustes.html" aria-label="Ajustes">${icono('ajustes', 18)}Ajustes</a>
        </header>
      </div>`;
    // El contenido de la página se mete dentro del marco.
    marco.querySelector('.principal').appendChild(contenido);
    document.body.insertBefore(marco, document.body.firstChild);

    if (esAdmin) Layout.marcarAdmin();
    Layout.refrescar();
  },

  // El menú del admin cambia de vista con el # de la URL (admin.html#reportes).
  marcarAdmin() {
    const pintar = () => {
      const actual = (location.hash || '#resumen').slice(1).split('/')[0]; // #reportes/5 sigue marcando "reportes"
      document.querySelectorAll('.menu a').forEach((a) => {
        const activo = location.pathname.endsWith('admin.html') && a.dataset.clave === actual;
        a.classList.toggle('activo', activo);
        if (activo) { a.setAttribute('aria-current', 'page'); document.getElementById('miga-actual').textContent = a.textContent; }
        else a.removeAttribute('aria-current');
      });
    };
    window.addEventListener('hashchange', pintar);
    pintar();
  },

  // Pide los datos frescos del usuario (la alcaldía con su nombre, la foto) y completa la barra lateral.
  async refrescar() {
    try {
      const yo = await API.get('/auth/yo');
      Auth.guardar(Auth.token(), { ...Auth.usuario(), nombre: yo.nombre, apellido: yo.apellido, idalcaldia: yo.idalcaldia, foto_perfil: yo.foto_perfil, rol: yo.rol });
      const zona = document.getElementById('zona-usuario');
      if (zona) zona.textContent = 'Zona: ' + yo.alcaldia;
      document.getElementById('avatar-lateral').innerHTML = avatarHtml(yo.foto_perfil, yo.nombre, yo.apellido);
      document.dispatchEvent(new CustomEvent('layout-listo', { detail: yo }));
    } catch (error) { /* si el token ya no sirve, api.js manda a login */ }
    Layout.quitarCarga();
  },

  // Pantalla de carga (wireframe 1): se muestra solo la primera vez de cada sesión, un instante.
  pantallaDeCarga() {
    if (sessionStorage.getItem('splash')) return;
    sessionStorage.setItem('splash', '1');
    const c = document.createElement('div');
    c.className = 'carga';
    c.id = 'pantalla-carga';
    c.setAttribute('role', 'status');
    c.innerHTML = `${logoHtml()}<div class="barra-carga"><i></i></div><div><strong>Segunda Vuelta</strong><br><span class="meta">Preparando…</span></div>`;
    document.body.appendChild(c);
    Layout.inicioCarga = Date.now();
  },
  quitarCarga() {
    const c = document.getElementById('pantalla-carga');
    if (!c) return;
    const falta = Math.max(0, 900 - (Date.now() - Layout.inicioCarga)); // se ve al menos 0.9 s para que no parpadee
    setTimeout(() => { c.classList.add('fuera'); setTimeout(() => c.remove(), 350); }, falta);
  },
};

if (Auth.token()) Layout.montar();
