// Subida de fotos con multer. Se guarda el ARCHIVO en uploads/ y en la base solo su ruta.
// Subida de fotos a Supabase Storage (bucket público "segundavuelta").
const crypto = require('crypto');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const { ErrorHttp } = require('../utilidades');

const BUCKET = process.env.SUPABASE_BUCKET || 'segundavuelta';

function obtenerClienteSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new ErrorHttp(500, 'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el servidor');
  }
  return createClient(url, key);
}

// carpeta: 'perfiles' o 'publicaciones'. Deja el archivo en req.file.buffer.
function subirFoto(carpeta) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxFotoBytes, files: 1 },
    fileFilter: (req, file, cb) =>
      config.tiposImagen[file.mimetype]
        ? cb(null, true)
        : cb(new ErrorHttp(400, 'La foto debe ser JPG, PNG o WEBP')),
  }).single('foto');
}

// Sube el archivo a Supabase Storage y devuelve su URL pública completa.
async function rutaPublica(carpeta, archivo) {
  const supabase = obtenerClienteSupabase();
  const ext = config.tiposImagen[archivo.mimetype] || '.jpg';
  const rutaInterna = `${carpeta}/${crypto.randomUUID()}${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(rutaInterna, archivo.buffer, {
      contentType: archivo.mimetype,
      upsert: false,
    });

  if (error) {
    console.error('Error subiendo foto a Supabase Storage:', error.message);
    throw new ErrorHttp(500, 'No se pudo guardar la foto en la nube');
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(rutaInterna);
  return data.publicUrl;
}

// Borra una foto anterior del bucket de Supabase a partir de su URL pública.
async function borrarArchivo(urlPublica) {
  if (!urlPublica || !urlPublica.includes(`/storage/v1/object/public/${BUCKET}/`)) return;
  try {
    const supabase = obtenerClienteSupabase();
    const rutaInterna = urlPublica.split(`/storage/v1/object/public/${BUCKET}/`);
    if (rutaInterna) {
      await supabase.storage.from(BUCKET).remove([rutaInterna]);
    }
  } catch (error) {
    console.error('Error borrando foto anterior:', error.message);
  }
}

module.exports = { subirFoto, rutaPublica, borrarArchivo };
  