// Utilidades que usan TODAS las páginas: hablar con la API, escapar texto, validar formularios, íconos y avisos.
// Se carga primero en cada HTML.

// ---------- Logo ----------
// Pon tu imagen en  public/img/logo.png  (las flechitas en bucle). Si no existe, se dibuja un ícono de reemplazo.
const RUTA_LOGO = '/img/logo.png';

// ---------- Dirección del backend (viene de config.js) ----------
// urlApi('/auth/yo')  → http://IP-DEL-BACKEND:4600/api/auth/yo
// urlArchivo('/uploads/...') → las fotos las sirve el BACKEND, no este frontend.
const urlApi = (ruta) => CONFIG.API_BASE + '/api' + ruta;
const urlArchivo = (ruta) => (!ruta ? '' : /^(https?:|blob:|data:)/.test(ruta) ? ruta : CONFIG.API_BASE + ruta);
const urlWebSocket = () => CONFIG.API_BASE.replace(/^http/i, 'ws') + '/ws'; // http→ws, https→wss

// ---------- Hablar con el servidor ----------
// Cada petición lleva el JWT en el encabezado Authorization. Si el servidor contesta 401 (token vencido o
// revocado) se borra la sesión local y se manda al usuario a iniciar sesión.
const API = (() => {
  async function pedir(metodo, ruta, cuerpo) {
    const opciones = { method: metodo, headers: {} };
    const token = localStorage.getItem('token');
    if (token) opciones.headers['Authorization'] = 'Bearer ' + token;
    if (cuerpo instanceof FormData) {
      opciones.body = cuerpo; // el navegador pone solo el Content-Type multipart
    } else if (cuerpo !== undefined) {
      opciones.headers['Content-Type'] = 'application/json';
      opciones.body = JSON.stringify(cuerpo);
    }
    let respuesta;
    try {
      respuesta = await fetch(urlApi(ruta), opciones);
    } catch (e) {
      // El navegador no pudo ni llegar al backend: casi siempre es IP/puerto mal, backend apagado, firewall o CORS.
      throw new Error('No se pudo conectar con el servidor (' + CONFIG.API_BASE + '). Revisa que el backend esté encendido y la IP en config.js.');
    }
    let datos = null;
    try { datos = await respuesta.json(); } catch (e) { /* respuesta sin cuerpo */ }

    if (respuesta.status === 401 && token && !location.pathname.endsWith('login.html')) {
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      location.href = '/login.html';
    }
    if (!respuesta.ok) {
      const error = new Error((datos && datos.error) || 'Error ' + respuesta.status);
      error.status = respuesta.status;
      error.datos = datos; // por ejemplo, el detalle de una sanción
      throw error;
    }
    return datos;
  }
  return {
    get: (r) => pedir('GET', r),
    post: (r, c) => pedir('POST', r, c),
    put: (r, c) => pedir('PUT', r, c),
    patch: (r, c) => pedir('PATCH', r, c || {}),
    del: (r) => pedir('DELETE', r),
  };
})();

// ---------- Seguridad: nunca pegar texto de usuarios en el HTML sin escapar (evita XSS) ----------
function esc(valor) {
  return String(valor === null || valor === undefined ? '' : valor)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---------- Íconos (SVG en línea, trazo del color del texto) ----------
const ICONOS = {
  inicio: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  buscar: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  mas: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  usuario: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  ajustes: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>',
  caja: '<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M3 7l9 5 9-5M12 12v10"/>',
  camisa: '<path d="M8 3L3 6l2 4 3-1v12h8V9l3 1 2-4-5-3a4 4 0 01-8 0z"/>',
  bebe: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c1 1.3 2.2 2 3.5 2s2.5-.7 3.5-2M9 10h.01M15 10h.01"/>',
  apoyo: '<circle cx="12" cy="5" r="1.8"/><path d="M12 8v6l4 3M12 14l-3 6M8 10h8"/>',
  bandera: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  escudo: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  panel: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  usuarios: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c.8-3.5 3.5-5 7-5s6.2 1.5 7 5M16 5a3.5 3.5 0 010 7M18 15c2 .5 3.5 2 4 5"/>',
  prohibido: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  sobre: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  etiqueta: '<path d="M3 12V3h9l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  lista: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  pin: '<path d="M12 21s7-6 7-12a7 7 0 10-14 0c0 6 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  bucle: '<path d="M7 7h8a3 3 0 013 3v1M17 17H9a3 3 0 01-3-3v-1"/><path d="M4 10l3-3-3-3M20 14l-3 3 3 3"/>',
  ojo: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  ojoTachado: '<path d="M3 3l18 18M10.6 6.1A9.7 9.7 0 0112 5c6 0 10 7 10 7a17 17 0 01-3.2 3.9M6.6 6.6C3.7 8.4 2 12 2 12s4 7 10 7c1.5 0 2.9-.4 4.1-1M9.9 9.9a3 3 0 004.2 4.2"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  atras: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  lapiz: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  filtro: '<path d="M4 6h16M7 12h10M10 18h4"/>',
};
function icono(nombre, tam = 20) {
  return `<svg width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[nombre] || ICONOS.caja}</svg>`;
}
// Ícono de una categoría según su nombre (las categorías nuevas que cree el admin usan la caja).
function iconoCategoria(nombre, tam = 28) {
  const n = String(nombre || '').toLowerCase();
  if (n.includes('ropa')) return icono('camisa', tam);
  if (n.includes('accesorio')) return icono('bebe', tam);
  if (n.includes('apoyo') || n.includes('equipo')) return icono('apoyo', tam);
  return icono('caja', tam);
}

// Imagen del logo; si no existe el archivo, se cambia por un ícono (se llama desde el onerror de la imagen).
function logoHtml() {
  return `<img class="logo-img" src="${RUTA_LOGO}" alt="" onerror="logoFallo(this)">`;
}
function logoFallo(img) {
  img.onerror = null;
  const caja = document.createElement('span');
  caja.className = 'logo-fallback';
  caja.innerHTML = icono('bucle', 24);
  img.replaceWith(caja);
}

// ---------- Avisos flotantes ----------
function aviso(texto, tipo = 'ok') {
  let caja = document.getElementById('avisos');
  if (!caja) { caja = document.createElement('div'); caja.id = 'avisos'; caja.setAttribute('role', 'status'); document.body.appendChild(caja); }
  const div = document.createElement('div');
  div.className = 'aviso ' + tipo;
  div.textContent = texto;
  caja.appendChild(div);
  setTimeout(() => div.remove(), 5000);
}
const mostrarError = (error) => aviso(error.message, 'error'); // atajo para el catch de las peticiones

// ---------- Validaciones del formulario (las MISMAS reglas que el servidor; el servidor igual las vuelve a revisar) ----------
// Cada función regresa un texto de error, o null si el dato está bien.
const Validar = {
  nombre(v, campo = 'El nombre') {
    const t = String(v).trim().replace(/\s+/g, ' ');
    if (t.length === 0) return `${campo} es obligatorio`;
    if (!/^\p{L}+(?:[ '’-]\p{L}+)*$/u.test(t)) return `${campo} solo puede llevar letras (sin números ni símbolos)`;
    if (t.replace(/[ '’-]/g, '').length < 2) return `${campo} debe tener al menos 2 letras`;
    if (t.length > 50) return `${campo} no puede pasar de 50 caracteres`;
    return null;
  },
  correo(v) {
    const t = String(v).trim().toLowerCase();
    if (!/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(t) || t.includes('..')) return 'Escribe un correo válido, como tu@correo.com';
    return null;
  },
  contrasena(v, campo = 'La contraseña') {
    if (v.length < 8 || v.length > 72) return `${campo} debe tener entre 8 y 72 caracteres`;
    if (/\s/.test(v)) return `${campo} no puede llevar espacios`;
    if (!/\p{L}/u.test(v) || !/\d/.test(v)) return `${campo} debe tener al menos una letra y un número`;
    return null;
  },
  // Texto libre: largo y patrones de ataque (lo mismo que esSospechoso en el servidor, en versión corta).
  texto(v, campo, min, max) {
    const t = String(v).replace(/\s+/g, ' ').trim();
    if (t.length < min) return min === 1 ? `${campo} es obligatorio` : `${campo} debe tener al menos ${min} caracteres`;
    if (t.length > max) return `${campo} no puede pasar de ${max} caracteres`;
    if (/<\s*\/?\s*(script|iframe|img|svg|style|object|embed)|javascript:|\b(drop|truncate|alter)\s+(if\s+exists\s+)?(database|table|schema)\b|\bunion\s+select\b|\bdelete\s+from\b|\binsert\s+into\b|;\s*(drop|delete)\b|\bor\s+1\s*=\s*1\b/i.test(t)) {
      return `${campo} contiene texto o símbolos no permitidos`;
    }
    return null;
  },
  titulo(v, campo, min, max) {
    const e = Validar.texto(v, campo, min, max);
    if (e) return e;
    if (!/^[\p{L}\p{N} .,:;()\-_/#&+%'’"¿?¡!°ºª·]+$/u.test(String(v).trim())) return `${campo} tiene símbolos no permitidos`;
    if (!/\p{L}/u.test(v)) return `${campo} debe llevar letras`;
    return null;
  },
};

// Muestra (o quita) el mensaje de error debajo de un campo. Regresa true si hay error.
function marcar(input, error) {
  const anfitrion = input.closest('.campo-clave') || input; // el mensaje va debajo de la caja completa (incluye el ojo)
  let msg = anfitrion.parentElement.querySelector(`.error-campo[data-de="${input.id}"]`);
  if (!msg && error) {
    msg = document.createElement('p');
    msg.className = 'error-campo';
    msg.dataset.de = input.id;
    msg.id = 'err-' + input.id;
    anfitrion.insertAdjacentElement('afterend', msg);
    input.setAttribute('aria-describedby', msg.id);
  }
  if (msg) { msg.textContent = error || ''; msg.hidden = !error; }
  input.setAttribute('aria-invalid', error ? 'true' : 'false');
  return !!error;
}
// Revisa varios campos a la vez: revisar([[input, error], ...]) → true si TODO está bien. Enfoca el primer error.
function revisar(pares) {
  let primero = null;
  pares.forEach(([input, error]) => { if (marcar(input, error) && !primero) primero = input; });
  if (primero) primero.focus();
  return !primero;
}
// Botón de "ojo" para mostrar/ocultar contraseñas.
function activarOjos(raiz = document) {
  raiz.querySelectorAll('.campo-clave').forEach((caja) => {
    if (caja.querySelector('.ojo')) return;
    const input = caja.querySelector('input');
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'ojo';
    boton.setAttribute('aria-label', 'Mostrar contraseña');
    boton.innerHTML = icono('ojoTachado');
    boton.addEventListener('click', () => {
      const ver = input.type === 'password';
      input.type = ver ? 'text' : 'password';
      boton.innerHTML = icono(ver ? 'ojo' : 'ojoTachado');
      boton.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña');
    });
    caja.appendChild(boton);
  });
}

// ---------- Textos para mostrar ----------
const ETIQUETAS = {
  condicion: { nuevo: 'Nuevo', como_nuevo: 'Como nuevo', buen_estado: 'Buen estado', con_detalles: 'Con detalles' },
  modalidad: { donacion: 'Donación', intercambio: 'Intercambio' },
  estado: { pendiente: 'Pendiente', aceptada: 'Aceptada', rechazada: 'Rechazada', completada: 'Completada' },
  disponibilidad: { disponible: 'Disponible', no_disponible: 'No disponible', eliminada: 'Eliminada' },
  sancion: { advertencia: 'Advertencia', suspension: 'Suspensión', baneo: 'Baneo' },
  estadoSancion: { vigente: 'Vigente', revertida: 'Revertida', finalizada: 'Finalizada' },
};
const fotoUrl = (ruta) => esc(urlArchivo(ruta)); // las fotos viven en el backend
const nombreCompleto = (n, a) => `${n || ''} ${a || ''}`.trim();
const iniciales = (n, a) => `${(n || '?')[0]}${(a || '')[0] || ''}`.toUpperCase();
const fechaCorta = (texto) => (texto ? String(texto).slice(0, 10) : '');
const puntosTexto = (p, total) => (Number(total) > 0 ? `${p} / 10 de confianza` : 'Aún sin calificaciones');

// "hoy", "ayer", "hace 3 días" o la fecha.
function fechaRelativa(texto) {
  if (!texto) return '';
  const d = new Date(String(texto).replace(' ', 'T'));
  const dias = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  if (dias < 7) return `hace ${dias} días`;
  return fechaCorta(texto);
}

// Foto de perfil o, si no hay, un círculo con las iniciales.
function avatarHtml(foto, nombre, apellido, clase = '') {
  return foto
    ? `<img class="avatar ${clase}" src="${fotoUrl(foto)}" alt="">`
    : `<span class="avatar ${clase}" aria-hidden="true">${esc(iniciales(nombre, apellido))}</span>`;
}

// Tarjeta de una publicación (la usan inicio, buscar y perfil).
function tarjetaPublicacion(p) {
  return `<a class="tarjeta" href="/publicacion.html?id=${p.idpublicacion}">
    <div class="foto"><img src="${fotoUrl(p.foto)}" alt="Foto de ${esc(p.nombre_articulo)}" loading="lazy"></div>
    <div class="cuerpo">
      <span class="etiqueta ${esc(p.modalidad)}">${ETIQUETAS.modalidad[p.modalidad]}</span>
      <h3>${esc(p.nombre_articulo)}</h3>
      <p class="meta">${ETIQUETAS.condicion[p.condicion]} · Zona: ${esc(p.alcaldia)}</p>
    </div></a>`;
}

// Llena un <select> con una lista de filas.
function llenarSelect(select, filas, valor, texto, primera) {
  select.innerHTML = (primera !== undefined ? `<option value="">${esc(primera)}</option>` : '') +
    filas.map((f) => `<option value="${esc(f[valor])}">${esc(f[texto])}</option>`).join('');
}

// Lee un parámetro de la URL (?id=5).
const parametro = (nombre) => new URLSearchParams(location.search).get(nombre);
