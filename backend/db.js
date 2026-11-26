// Conexión a PostgreSQL (Supabase) usando pg.
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '.env') });

function convertirPlaceholders(sql) {
  let indice = 0;
  let enComilla = false;
  let salida = '';

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") {
      if (enComilla && sql[i + 1] === "'") {
        salida += "''";
        i++;
      } else {
        enComilla = !enComilla;
        salida += ch;
      }
    } else if (ch === '?' && !enComilla) {
      indice++;
      salida += `$${indice}`;
    } else {
      salida += ch;
    }
  }
  return salida;
}

// Detecta si es un INSERT sin RETURNING para anexar RETURNING y obtener insertId.
function prepararConsulta(sql) {
  const texto = convertirPlaceholders(sql.trim());
  const esInsert = /^INSERT\s+INTO\s+([a-zA-Z0-9_]+)/i.test(texto);
  const tieneReturning = /\bRETURNING\b/i.test(texto);

  if (esInsert && !tieneReturning) {
    // Intenta devolver la primera columna id* si existe.
    const limpia = texto.replace(/;\s*$/, '');
    return { texto: `${limpia} RETURNING *`, esInsertAuto: true };
  }
  return { texto, esInsertAuto: false };
}

function envolverEjecutor(ejecutor) {
  async function query(sql, params = []) {
    const { texto, esInsertAuto } = prepararConsulta(sql);
    const res = await ejecutor.query(texto, params);

    if (esInsertAuto) {
      const fila = res.rows[0] || {};
      const claveId = Object.keys(fila).find((k) => /^id[a-z0-9_]*$/i.test(k));
      const insertId = claveId ? fila[claveId] : null;
      return [{ insertId, affectedRows: res.rowCount, rows: res.rows }, res.fields];
    }

    if (/^(UPDATE|DELETE)\b/i.test(texto.trim())) {
      return [{ affectedRows: res.rowCount, rows: res.rows }, res.fields];
    }

    return [res.rows, res.fields];
  }

  return { query };
}

function crearPool() {
  const connectionString = process.env.DATABASE_URL;
  const usarSsl =
    Boolean(connectionString) ||
    process.env.DB_SSL === 'true' ||
    process.env.NODE_ENV === 'production';

  const configPool = connectionString
    ? {
        connectionString,
        max: 10,
        ssl: usarSsl ? { rejectUnauthorized: false } : false,
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME || 'postgres',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        max: 10,
        ssl: usarSsl ? { rejectUnauthorized: false } : false,
      };

  const pgPool = new Pool(configPool);
  const base = envolverEjecutor(pgPool);

  async function getConnection() {
    const client = await pgPool.connect();
    const execClient = envolverEjecutor(client);
    return {
      query: execClient.query,
      beginTransaction: () => client.query('BEGIN'),
      commit: () => client.query('COMMIT'),
      rollback: () => client.query('ROLLBACK'),
      release: () => client.release(),
    };
  }

  return {
    query: base.query,
    getConnection,
    end: () => pgPool.end(),
    raw: pgPool,
  };
}

module.exports = { crearPool };