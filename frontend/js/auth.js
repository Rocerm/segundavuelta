// Sesión en el navegador con JWT: guarda el token, protege las páginas y maneja login.html (iniciar sesión y crear cuenta).
// La barra lateral y la barra superior las dibuja layout.js.
const Auth = {
  token: () => localStorage.getItem('token'),
  usuario: () => { try { return JSON.parse(localStorage.getItem('usuario')); } catch (e) { return null; } },

  guardar(token, usuario) {
    localStorage.setItem('token', token);
    localStorage.setItem('usuario', JSON.stringify(usuario));
  },
  limpiar() {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
  },

  // Si no hay token, manda a login. (El servidor es quien REALMENTE protege; esto es solo comodidad.)
  requerir() {
    if (!Auth.token()) { location.href = '/login.html'; return false; }
    return true;
  },

  // Cierra sesión en el servidor (revoca el token) y luego borra todo local.
  async cerrarSesion() {
    try { await API.post('/auth/logout'); } catch (e) { /* si el token ya no servía, da igual */ }
    Auth.limpiar();
    sessionStorage.removeItem('splash');
    location.href = '/login.html';
  },

  // A dónde va cada rol después de entrar.
  inicio: (u) => (u && u.rol === 'admin' ? '/admin.html' : '/index.html'),
};

// ---------- login.html ----------
function iniciarPaginaLogin() {
  Auth.limpiar(); // al llegar aquí se parte de cero (por si quedó un token viejo)
  document.querySelectorAll('[data-logo]').forEach((c) => { c.innerHTML = logoHtml(); });
  activarOjos();

  const vistaLogin = document.getElementById('vista-login');
  const vistaRegistro = document.getElementById('vista-registro');
  const formLogin = document.getElementById('form-login');
  const formRegistro = document.getElementById('form-registro');
  const bloqueo = document.getElementById('bloqueo');

  // Cambiar entre "Iniciar sesión" y "Crear cuenta" (empieza en registro si la URL trae #registro)
  function mostrar(cual) {
    vistaLogin.hidden = cual !== 'login';
    vistaRegistro.hidden = cual !== 'registro';
    bloqueo.hidden = true;
    history.replaceState(null, '', cual === 'registro' ? '#registro' : location.pathname);
  }
  document.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => mostrar(b.dataset.ir)));
  mostrar(location.hash === '#registro' ? 'registro' : 'login');

  API.get('/catalogos/alcaldias')
    .then((filas) => llenarSelect(document.getElementById('reg-alcaldia'), filas, 'idalcaldia', 'nombre', 'Elige tu alcaldía'))
    .catch(mostrarError);

  // En los campos de nombre no se dejan escribir números ni símbolos.
  ['reg-nombre', 'reg-apellido'].forEach((id) => {
    const campo = document.getElementById(id);
    campo.addEventListener('input', () => { campo.value = campo.value.replace(/[^\p{L} '’-]/gu, ''); });
  });

  // ----- Iniciar sesión -----
  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const correo = document.getElementById('log-correo');
    const clave = document.getElementById('log-clave');
    if (!revisar([[correo, Validar.correo(correo.value)], [clave, clave.value ? null : 'Escribe tu contraseña']])) return;
    bloqueo.hidden = true;
    try {
      const r = await API.post('/auth/login', { correo: correo.value, contrasena: clave.value });
      Auth.guardar(r.token, r.usuario);
      location.href = Auth.inicio(r.usuario);
    } catch (error) {
      if (error.datos && error.datos.sancion) mostrarBloqueo(error.message, error.datos.sancion, correo.value, clave.value);
      else mostrarError(error);
    }
  });

  // Cuenta baneada o suspendida: se le dice por qué y puede explicar si cree que fue un error.
  function mostrarBloqueo(titulo, s, correo, clave) {
    let estado = '';
    if (s.apelacion_estado === 'pendiente') {
      estado = '<p><strong>Tu explicación ya fue enviada.</strong> Un administrador la está revisando.</p>';
    } else if (s.apelacion_estado === 'rechazada') {
      estado = `<p><strong>Revisamos tu explicación y la sanción se mantiene.</strong><br>${esc(s.apelacion_respuesta || '')}</p>`;
    } else {
      estado = '<button type="button" class="boton chico" id="b-apelar">Creo que fue un error</button>';
    }
    bloqueo.hidden = false;
    bloqueo.innerHTML = `<h3>${esc(titulo)}</h3>
      <p><strong>Motivo:</strong> ${esc(s.motivo)}</p>
      <p class="meta">Aplicada el ${fechaCorta(s.fecha)}${s.fecha_fin ? ' · termina el ' + fechaCorta(s.fecha_fin) : ''}</p>${estado}`;
    const boton = document.getElementById('b-apelar');
    if (boton) boton.addEventListener('click', () => abrirApelacion(correo, clave));
  }

  function abrirApelacion(correo, clave) {
    const d = document.createElement('dialog');
    d.innerHTML = `<form method="dialog" novalidate><h2>Explica qué pasó</h2>
      <p class="meta">Cuéntanos por qué crees que la sanción fue un error. Un administrador la revisará.</p>
      <label for="ap-texto">Tu explicación</label>
      <textarea id="ap-texto" maxlength="500" required></textarea>
      <div class="acciones"><button class="boton" type="submit">Enviar</button><button class="boton claro" type="button" id="ap-cancelar">Cancelar</button></div></form>`;
    document.body.appendChild(d);
    d.showModal();
    d.querySelector('#ap-cancelar').addEventListener('click', () => { d.close(); d.remove(); });
    d.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const texto = d.querySelector('#ap-texto');
      if (!revisar([[texto, Validar.texto(texto.value, 'Tu explicación', 10, 500)]])) return;
      try {
        const r = await API.post('/auth/apelaciones', { correo, contrasena: clave, mensaje: texto.value });
        aviso(r.mensaje);
        d.close(); d.remove();
        bloqueo.innerHTML += '<p><strong>Explicación enviada.</strong> Te avisaremos aquí mismo cuando haya respuesta.</p>';
        const b = document.getElementById('b-apelar'); if (b) b.remove();
      } catch (error) { mostrarError(error); }
    });
  }

  // ----- Crear cuenta -----
  const campos = ['nombre', 'apellido', 'correo', 'clave', 'confirmar', 'alcaldia'].reduce((o, c) => { o[c] = document.getElementById('reg-' + c); return o; }, {});
  const reglas = () => [
    [campos.nombre, Validar.nombre(campos.nombre.value, 'El nombre')],
    [campos.apellido, Validar.nombre(campos.apellido.value, 'El apellido')],
    [campos.correo, Validar.correo(campos.correo.value)],
    [campos.clave, Validar.contrasena(campos.clave.value)],
    [campos.confirmar, campos.confirmar.value === campos.clave.value ? null : 'Las contraseñas no coinciden'],
    [campos.alcaldia, campos.alcaldia.value ? null : 'Elige tu alcaldía'],
  ];
  // Al salir de cada campo se revisa solo ese campo.
  reglas().forEach(([campo], i) => campo.addEventListener('blur', () => marcar(campo, reglas()[i][1])));

  formRegistro.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!revisar(reglas())) return;
    try {
      const r = await API.post('/auth/registro', {
        nombre: campos.nombre.value, apellido: campos.apellido.value, correo: campos.correo.value,
        contrasena: campos.clave.value, idalcaldia: campos.alcaldia.value,
      });
      Auth.guardar(r.token, r.usuario);
      location.href = '/intereses.html?nuevo=1'; // al crear la cuenta se eligen los intereses
    } catch (error) { mostrarError(error); }
  });
}

if (document.body.dataset.publica === 'si') iniciarPaginaLogin();
else Auth.requerir();
