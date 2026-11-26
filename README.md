# Segunda Vuelta

-Castelan Melo María José
-Lizarde Linares Brandon
-Mendoza Ceras Rodrigo
-Pérez Flores Angel Humberto










Plataforma para **donar e intercambiar artículos de bebé y de adulto mayor** en la CDMX.
Dos proyectos independientes que se pueden correr **en computadoras distintas**:

| Carpeta | Qué es | Puerto |
|---|---|---|
| `backend/` | API: Node.js + Express 5 + MySQL + **JWT** + WebSocket (chat). También guarda las fotos (`uploads/`). | 4600 |
| `frontend/` | HTML + CSS + JavaScript. Solo necesita Node para su mini servidor (o Live Server). | 5500 |

## Correrlos en computadoras distintas (red de la escuela)

Ejemplo: el **backend** en la compu `192.168.20.1` y el **frontend** en cualquier otra.

**Compu del BACKEND**
```bash
cd backend
npm install
# copia .env.example como .env y pon tu contraseña de MySQL y un JWT_SECRET largo
npm run bd          # crea la base (BORRA dbsegundavuelta si existe) con catálogos y 3 usuarios
npm start
```
Al arrancar imprime sus IPs de red, por ejemplo `http://192.168.20.1:4600`. **Esa es la dirección del backend.**
Permite el puerto **4600** en el firewall de Windows si te lo pregunta.

**Compu del FRONTEND**
1. Abre `frontend/js/config.js` y cambia la primera línea de configuración:
   ```js
   const API_POR_DEFECTO = 'http://192.168.20.1:4600';   // ← la IP del backend
   ```
   (Alternativa sin editar: abre una vez `http://localhost:5500/login.html?api=http://192.168.20.1:4600`; queda guardada en el navegador.)
2. Levanta el front:
   ```bash
   cd frontend
   npm start           # → http://localhost:5500   (no instala nada)
   ```
   o abre la carpeta `frontend/` con Live Server de VS Code.
3. Entra a `http://localhost:5500` (o `http://IP-DEL-FRONT:5500` desde otras compus).

**Si no conecta** (sale "No se pudo conectar con el servidor"):
- ¿El backend está encendido y su IP/puerto coinciden con `config.js`?
- ¿Firewall del backend con el puerto 4600 abierto? Prueba abrir `http://IP-DEL-BACKEND:4600/api/catalogos/alcaldias` desde la compu del front: si ahí no responde, es red/firewall.
- Algunas redes escolares aíslan los equipos entre sí: prueba con el hotspot de un celular.
- Si limitaste CORS en el `.env` del backend (`CORS_ORIGINS`), debe incluir la dirección del front (ej. `http://192.168.20.5:5500`). Con `*` (por defecto) acepta cualquiera.

**Todo en una sola compu y un solo puerto (opcional, para desarrollar):** en `backend/.env` pon `SERVIR_FRONT=si`, deja `API_POR_DEFECTO = 'http://localhost:4600'` y entra a `http://localhost:4600`.

Usuarios de ejemplo: `admin@segundavuelta.mx / Admin12345` (admin) · `ana@correo.mx / Ana12345` · `luis@correo.mx / Luis12345`

**Logo:** pon tu imagen en `frontend/img/logo.png` (ver `frontend/img/LEEME.txt`). Mientras no exista se muestra un ícono de reemplazo.

## Cómo se comunican

- El front llama a `http://IP-BACKEND:4600/api/...` con `fetch` y manda el JWT en `Authorization: Bearer <token>` (no hay cookies, por eso no hay problemas entre dos computadoras).
- Las **fotos** las sirve el backend (`/uploads/...`); el front las pide con la IP del backend.
- El **chat** es un WebSocket al backend: `ws://IP-BACKEND:4600/ws?token=<JWT>`.
- El backend tiene **CORS** (`backend/middlewares/cors.middleware.js`) para aceptar al front desde otro origen.

## Autenticación con JWT

1. `POST /api/auth/login` o `/registro` → el servidor firma un token (`sub` = id, `jti` único, vence en `config.jwtExpiraSeg`).
2. `requiereSesion` verifica firma, vencimiento, que el `jti` **no esté en `tokens_revocados`** y que la cuenta siga activa y sin suspensión. El **rol se lee de la base**, no del token.
3. `POST /api/auth/logout` guarda el `jti` en la lista negra. Cada hora se borran los vencidos.

## Rol admin (panel aparte)

`admin.html` con su propia barra lateral: Resumen, Reportes, Usuarios reportados, Sanciones, Apelaciones, Publicaciones (todas) y Categorías.
El admin **no** publica, solicita, chatea ni califica (el servidor responde 403). Sus ajustes: nombre, apellido, contraseña y cerrar sesión.

- **Sanciones revertibles:** una sanción revertida no se borra (`fecha_revertida`); un baneo revertido reactiva la cuenta.
- **Apelaciones:** al intentar entrar, una cuenta baneada/suspendida ve el motivo y puede explicar por qué cree que fue un error. El admin acepta (revierte) o rechaza con una respuesta.
- **Categorías:** `requiere_sellado` (nuevo + caducidad obligatoria) y `permite_caducidad` (si es `false` el campo se bloquea en el formulario y el servidor lo rechaza).

## Validaciones

| Campo | Regla |
|---|---|
| Nombre / apellido | solo letras (acentos, ñ), espacio/guion/apóstrofo; 2 a 50; sin números ni símbolos |
| Correo | formato válido, minúsculas, sin espacios |
| Contraseña | 8 a 72, sin espacios, con una letra y un número |
| Artículo / categoría | 3 a 100, letras, números y puntuación básica |
| Textos libres | se limpian y se revisa el largo |

**Inyecciones:** todas las consultas son parametrizadas (`?`) y el front escapa todo lo que muestra. Además `esSospechoso()` (`backend/utilidades.js`) rechaza patrones como `DROP DATABASE IF EXISTS`, `UNION SELECT`, `OR 1=1`, `<script>`, `onerror=`. El login se frena tras 8 intentos fallidos por IP+correo en 10 minutos.

## Base de datos (13 tablas + 2 vistas)

`bd/bdsegundavuelta.sql` (sin tabla `sessions`). Incluye `apelaciones`, `sanciones.fecha_revertida`/`idadmin_reversion`, `categorias.permite_caducidad` y CHECK de largo en nombres.
Si el servidor dice "esquema ANTERIOR", corre `npm run bd`.
