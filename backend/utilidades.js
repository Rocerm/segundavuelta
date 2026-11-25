// Utilidades compartidas: un error con código HTTP y los VALIDADORES de datos de entrada.
// Los modelos y las rutas lanzan ErrorHttp; el manejador de errores de app.js lo convierte en respuesta JSON.
//
// SOBRE LAS INYECCIONES:
//  1) SQL: TODAS las consultas usan "?" (consultas parametrizadas). Con eso, un texto como  '; DROP DATABASE x; --
//     se guarda como simple texto y jamás se ejecuta. Esa es la defensa real.
//  2) HTML/JS (XSS): el frontend escapa todo lo que muestra (esc() en api.js).
//  3) Capa extra: esSospechoso() rechaza textos que contienen patrones típicos de ataque, para que ni siquiera se guarden.

class ErrorHttp extends Error {
  // 'datos' (opcional) son campos extra que se mandan en el JSON de error (por ejemplo, el detalle de una sanción).
  constructor(status, mensaje, datos) {
    super(mensaje);
    this.status = status; // 400 datos mal, 401 sin sesión, 403 sin permiso, 404 no existe, 409 conflicto, 429 muchos intentos
    this.datos = datos || null;
  }
}

// ---------- Patrones de ataque conocidos ----------
const PATRONES_SOSPECHOSOS = [
  /<\s*\/?\s*(script|iframe|object|embed|img|svg|style|link|meta|form|input|body|html)\b/i, // etiquetas HTML peligrosas
  /<[^>]*\bon[a-z]+\s*=/i, // <algo onerror=...>
  /javascript\s*:/i,
  /\b(drop|truncate|alter|create)\s+(if\s+(not\s+)?exists\s+)?(database|schema|table|view|user|index)\b/i, // DROP DATABASE IF EXISTS...
  /\bdelete\s+from\b/i,
  /\binsert\s+into\b/i,
  /\bupdate\s+\S+\s+set\b/i,
  /\bunion\s+(all\s+)?select\b/i,
  /\bselect\b[\s\S]{0,80}\bfrom\b/i,
  /;\s*(drop|delete|update|insert|select|shutdown|exec)\b/i,
  /'\s*(or|and)\s+['"\w]+\s*=\s*['"\w]+/i, // ' OR 1=1
  /\b(or|and)\s+\d+\s*=\s*\d+/i, // OR 1=1
  /\/\*[\s\S]*?\*\//, // comentarios /* */
  /(^|\s)--(\s|$)/, // comentario SQL "-- "
  /\b(xp_cmdshell|information_schema|load_file|into\s+outfile|sleep\s*\(|benchmark\s*\()/i,
  /\$\{|\{\{|<%/, // plantillas
  /\.\.[\\/]/, // ../ (recorrer carpetas)
];
function esSospechoso(t) {
  return PATRONES_SOSPECHOSOS.some((patron) => patron.test(t));
}

// Limpia un texto: normaliza acentos (NFC), quita caracteres de control y, si es de una línea, junta los espacios repetidos.
function limpiar(valor, multilinea) {
  let t = String(valor).normalize('NFC');
  t = t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u2028\u2029\uFEFF]/g, ''); // control y "invisibles"
  t = multilinea ? t.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n') : t.replace(/\s+/g, ' ');
  return t.trim();
}
const largo = (t) => [...t].length; // cuenta caracteres reales (un emoji cuenta 1)

// Texto obligatorio (o null si es opcional y viene vacío). Limpia, valida el largo y rechaza patrones de ataque.
function texto(valor, campo, { min = 1, max = 255, opcional = false, multilinea = false } = {}) {
  if (valor === undefined || valor === null || (typeof valor === 'string' && valor.trim() === '')) {
    if (opcional) return null;
    throw new ErrorHttp(400, `${campo} es obligatorio`);
  }
  if (typeof valor !== 'string' && typeof valor !== 'number') throw new ErrorHttp(400, `${campo} no es válido`);
  const t = limpiar(valor, multilinea);
  if (t === '') {
    if (opcional) return null;
    throw new ErrorHttp(400, `${campo} es obligatorio`);
  }
  if (largo(t) < min || largo(t) > max) throw new ErrorHttp(400, `${campo} debe tener entre ${min} y ${max} caracteres`);
  if (esSospechoso(t)) throw new ErrorHttp(400, `${campo} contiene texto o símbolos no permitidos`);
  return t;
}

// Nombre o apellido de persona: SOLO letras (con acentos y ñ), separadas por un espacio, guion o apóstrofo.
// Mínimo 2 letras (sin contar espacios), máximo 50 caracteres. Sin números ni símbolos raros.
function nombrePersona(valor, campo) {
  const t = texto(valor, campo, { min: 2, max: 50 });
  if (!/^\p{L}+(?:[ '’-]\p{L}+)*$/u.test(t)) throw new ErrorHttp(400, `${campo} solo puede llevar letras (sin números ni símbolos)`);
  if (t.replace(/[ '’-]/g, '').length < 2) throw new ErrorHttp(400, `${campo} debe tener al menos 2 letras`);
  return t;
}

// Texto corto "descriptivo" (nombre de artículo, de categoría): letras, números, espacios y puntuación básica.
function tituloSeguro(valor, campo, { min = 3, max = 100 } = {}) {
  const t = texto(valor, campo, { min, max });
  if (!/^[\p{L}\p{N} .,:;()\-_/#&+%'’"¿?¡!°ºª·]+$/u.test(t)) throw new ErrorHttp(400, `${campo} tiene símbolos no permitidos`);
  if (!/\p{L}/u.test(t)) throw new ErrorHttp(400, `${campo} debe llevar letras`);
  return t;
}

// Correo: sin espacios, minúsculas, formato usuario@dominio.ext
function correo(valor) {
  const t = texto(valor, 'El correo', { min: 6, max: 150 }).toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(t) || t.includes('..')) throw new ErrorHttp(400, 'El correo no es válido');
  return t;
}

// Contraseña nueva: 8 a 72 caracteres (bcrypt solo lee 72), sin espacios, al menos una letra y un número.
// NO se recorta ni se limpia: se guarda tal cual (solo se guarda su hash).
function contrasena(valor, campo = 'La contraseña') {
  if (typeof valor !== 'string' || valor === '') throw new ErrorHttp(400, `${campo} es obligatoria`);
  if (valor.length < 8 || valor.length > 72) throw new ErrorHttp(400, `${campo} debe tener entre 8 y 72 caracteres`);
  if (/\s/.test(valor)) throw new ErrorHttp(400, `${campo} no puede llevar espacios`);
  if (!/\p{L}/u.test(valor) || !/\d/.test(valor)) throw new ErrorHttp(400, `${campo} debe tener al menos una letra y un número`);
  return valor;
}

// Número entero (acepta "5" como texto, porque los formularios mandan texto).
function entero(valor, campo, { min = 1, max = 2147483647, opcional = false } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (opcional) return null;
    throw new ErrorHttp(400, `${campo} es obligatorio`);
  }
  const n = typeof valor === 'object' ? NaN : Number(valor);
  if (!Number.isInteger(n) || n < min || n > max) throw new ErrorHttp(400, `${campo} no es válido`);
  return n;
}

// Verdadero/falso (true, "true", 1, "1", "on"...).
function booleano(valor) {
  return valor === true || valor === 1 || ['true', '1', 'on', 'si', 'sí'].includes(String(valor).toLowerCase());
}

// El valor debe ser uno de la lista permitida (para los enum de la base). Si es opcional y viene vacío regresa null.
function enumerado(valor, campo, permitidos, { opcional = false } = {}) {
  if (opcional && (valor === undefined || valor === null || valor === '')) return null;
  if (typeof valor !== 'string' || !permitidos.includes(valor)) {
    throw new ErrorHttp(400, `${campo} no es válido (usa: ${permitidos.join(', ')})`);
  }
  return valor;
}

// Fecha en formato AAAA-MM-DD que además exista de verdad (rechaza 2026-02-31).
function fecha(valor, campo, { opcional = false } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (opcional) return null;
    throw new ErrorHttp(400, `${campo} es obligatorio`);
  }
  const t = String(valor);
  const d = new Date(`${t}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== t) {
    throw new ErrorHttp(400, `${campo} debe tener el formato AAAA-MM-DD`);
  }
  return t;
}

module.exports = { ErrorHttp, texto, nombrePersona, tituloSeguro, correo, contrasena, entero, booleano, enumerado, fecha, esSospechoso };
