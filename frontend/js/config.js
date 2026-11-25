// Configuración del FRONTEND: detecta si corre en local o en producción (Vercel → Render).
const esLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);

const API_POR_DEFECTO = esLocal
  ? 'http://localhost:4600'
  : 'https://onrender.com'; // ← Aquí pondrás la URL que te dé Render

const CONFIG = (() => {
  const url = new URLSearchParams(location.search).get('api');
  if (url && /^https?:\/\/[\w.-]+(:\d+)?$/i.test(url.replace(/\/+$/, ''))) {
    localStorage.setItem('api_base', url.replace(/\/+$/, ''));
  }
  if (url === 'borrar') localStorage.removeItem('api_base');
  return { API_BASE: localStorage.getItem('api_base') || API_POR_DEFECTO };
})();
