// Crea (o vuelve a crear desde cero) la base de datos con sus tablas, vistas, catálogos y 3 usuarios de ejemplo.
//
//   npm run bd
//
// OJO: borra la base si ya existía. Lee bdsegundavuelta.sql (el mismo que se importa en Workbench)
// y le quita sus líneas CREATE DATABASE / USE para poder crear la base con otro nombre.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Usuarios de ejemplo (contraseña solo para desarrollo; cámbialas en un servidor real).
const USUARIOS = [
  ['Admin', 'Segunda Vuelta', 'admin@segundavuelta.mx', 'Admin12345', 'admin', 6], // 6 = Cuauhtémoc
  ['Ana', 'Pérez', 'ana@correo.mx', 'Ana12345', 'usuario', 4], // 4 = Coyoacán
  ['Luis', 'Gómez', 'luis@correo.mx', 'Luis12345', 'usuario', 9], // 9 = Iztapalapa
];

async function crearBaseDeDatos(nombre = process.env.DB_NAME || 'dbsegundavuelta') {
  if (!/^[a-z0-9_]+$/i.test(nombre)) throw new Error(`Nombre de base inválido: ${nombre}`);
  const conexion = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
    charset: 'utf8mb4',
  });
  try {
    const esquema = fs
      .readFileSync(path.join(__dirname, 'bdsegundavuelta.sql'), 'utf8')
      .replace(/^\s*(DROP DATABASE|CREATE DATABASE|USE)\b[^;]*;\s*$/gim, '');
    await conexion.query(`DROP DATABASE IF EXISTS \`${nombre}\``);
    await conexion.query(`CREATE DATABASE \`${nombre}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conexion.query(`USE \`${nombre}\``);
    await conexion.query(esquema);
    for (const [nom, ape, correo, clave, rol, alcaldia] of USUARIOS) {
      await conexion.query(
        'INSERT INTO usuarios (nombre, apellido, correo, contrasena_hash, rol, idalcaldia) VALUES (?, ?, ?, ?, ?, ?)',
        [nom, ape, correo, await bcrypt.hash(clave, 10), rol, alcaldia]
      );
    }
  } finally {
    await conexion.end();
  }
  return nombre;
}

module.exports = { crearBaseDeDatos };

if (require.main === module) {
  crearBaseDeDatos()
    .then((nombre) => {
      console.log(`Base de datos "${nombre}" creada.`);
      console.log('Usuarios de ejemplo:');
      USUARIOS.forEach((u) => console.log(`  ${u[2]}  /  ${u[3]}  (${u[4]})`));
    })
    .catch((error) => {
      console.error('No se pudo crear la base de datos:', error.message);
      console.error('Revisa que MySQL esté encendido y los datos de tu archivo .env');
      process.exit(1);
    });
}
