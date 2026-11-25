-- Integrantes del equipo:
-- Castelán Melo María José
-- Lizarde Linares Brandon
-- Mendoza Ceras Rodrigo
-- Perez Flores Angel Humberto
create database if not exists dbsegundavuelta
-- Establece la codificación para soportar caracteres especiales y emojis, con búsquedas sin distinguir mayúsculas de minúsculas.
character set utf8mb4 collate utf8mb4_unicode_ci;
use dbsegundavuelta;

-- 1. Zona es sustituido por alcadias y solo las de CDMX, para reducir la información.
create table if not exists alcaldias(
  idalcaldia int auto_increment primary key,
  nombre varchar(100) not null unique
) engine=InnoDB; -- el motor InnoDB permite relaciones entre tablas (llaves foráneas) y transacciones seguras.

-- 2. USUARIOS (solo un tipo de usuario y admin se distingue por rol).
-- idalcaldia es obligatoria, se pide al crear la cuenta y el usuario. La alcadia se puede cambiar en perfil o ajustes.
-- Eliminar cuenta = activo = false
create table if not exists usuarios(
  idusuario int auto_increment primary key,
  nombre varchar(100) not null,
  apellido varchar(100) not null,
  correo varchar(150) not null unique,
  contrasena_hash varchar(255) not null,
  idalcaldia int not null,
  foto_perfil varchar(255) null,          -- ruta del archivo, no la imagen
  biografia varchar(255) null,
  rol enum('usuario','admin') not null default 'usuario',
  activo boolean not null default true,
  fecha_registro datetime not null default current_timestamp,
  constraint fk_usuarios_alcaldia foreign key (idalcaldia)
    references alcaldias(idalcaldia),
  -- Validación de largo en la propia BD (la app además exige solo letras). Se cuentan los caracteres sin espacios sobrantes.
  constraint ck_usuarios_nombre check (char_length(trim(nombre)) between 2 and 50),
  constraint ck_usuarios_apellido check (char_length(trim(apellido)) between 2 and 50)
) engine=InnoDB;

-- 3. CATEGORIAS
-- Las categorias las administra el admin desde su panel.
-- requiere_sellado = true: la publicacion debe ser condicion 'nuevo' y llevar fecha de caducidad (ej. formulas y alimentos). Esta regla
-- la validaría la aplicacion leyendo esta columna.
create table if not exists categorias(
  idcategoria int auto_increment primary key,
  nombre varchar(100) not null unique,
  descripcion varchar(255) not null,
  requiere_sellado boolean not null default false,
  -- permite_caducidad = false: la categoria no maneja fecha de caducidad (ropa, accesorios, apoyos). La app bloquea ese campo.
  permite_caducidad boolean not null default true,
  -- Si exige sellado, por fuerza tiene que admitir caducidad.
  constraint ck_cat_sellado_caduca check (not requiere_sellado or permite_caducidad)
) engine=InnoDB;

-- 4. INTERESES DEL USUARIO (muchos a muchos usuarios <-> categorias)
create table if not exists usuario_categoria(
  idusuario int not null,
  idcategoria int not null,
  primary key (idusuario, idcategoria),
  constraint fk_uc_usuario foreign key (idusuario)
    references usuarios(idusuario) on delete cascade,
  constraint fk_uc_categoria foreign key (idcategoria)
    references categorias(idcategoria) on delete cascade
) engine=InnoDB;

-- 5. PUBLICACIONES (articulo y publicación)
-- El dueño cambia disponibilidad cuando el artículo haya sido intercambiado o donado.
-- UPDT: Se agregó 'eliminada' para borrado lógico.
create table if not exists publicaciones(
  idpublicacion int auto_increment primary key,
  idusuario int not null,                 -- dueño de la publicacion
  idcategoria int not null,
  idalcaldia int not null,                -- "Zona de entrega" (alcaldia)
  nombre_articulo varchar(100) not null,
  descripcion text not null,
  foto varchar(255) not null,             -- ruta de la foto (una sola)
  condicion enum('nuevo','como_nuevo','buen_estado','con_detalles') not null,
  modalidad enum('donacion','intercambio') not null,
  caducidad date null,                    -- "si aplica"
  disponibilidad enum('disponible','no_disponible','eliminada') not null default 'disponible',
  fecha_creacion datetime not null default current_timestamp,
  fecha_actualizacion datetime not null default current_timestamp
    on update current_timestamp,
  constraint fk_pub_usuario foreign key (idusuario)
    references usuarios(idusuario),
  constraint fk_pub_categoria foreign key (idcategoria)
    references categorias(idcategoria),
  constraint fk_pub_alcaldia foreign key (idalcaldia)
    references alcaldias(idalcaldia),
  constraint ck_pub_nombre check (char_length(trim(nombre_articulo)) >= 3),
  index idx_pub_disponibilidad (disponibilidad),
  index idx_pub_categoria (idcategoria),
  index idx_pub_alcaldia (idalcaldia),
  index idx_pub_usuario (idusuario)
) engine=InnoDB;

-- 6. SOLICITUDES
-- idpublicacion_ofrecida: solo se llena en intercambios.
-- "completada" = el dueño confirmo la entrega a esta persona.
create table if not exists solicitudes(
  idsolicitud int auto_increment primary key,
  idpublicacion int not null,
  idsolicitante int not null,
  idpublicacion_ofrecida int null,
  mensaje varchar(500) not null,
  estado enum('pendiente','aceptada','rechazada','completada')
    not null default 'pendiente',
  fecha_solicitud datetime not null default current_timestamp,
  fecha_completada datetime null,
  unique key uq_solicitud (idpublicacion, idsolicitante),
  constraint fk_sol_publicacion foreign key (idpublicacion)
    references publicaciones(idpublicacion),
  constraint fk_sol_solicitante foreign key (idsolicitante)
    references usuarios(idusuario),
  constraint fk_sol_ofrecida foreign key (idpublicacion_ofrecida)
    references publicaciones(idpublicacion) on delete set null,
  index idx_sol_solicitante (idsolicitante),
  index idx_sol_estado (estado)
) engine=InnoDB;

-- 7. MENSAJES 
create table if not exists mensajes(
  idmensaje int auto_increment primary key,
  idsolicitud int not null,
  idremitente int not null,
  contenido varchar(1000) not null,
  fecha_envio datetime not null default current_timestamp,
  constraint fk_msj_solicitud foreign key (idsolicitud)
    references solicitudes(idsolicitud) on delete cascade,
  constraint fk_msj_remitente foreign key (idremitente)
    references usuarios(idusuario),
  index idx_msj_chat (idsolicitud, fecha_envio)
) engine=InnoDB;

-- 8. CALIFICACIONES (ambos se califican, criterios de 0 a 5)
-- veracidad es NULL cuando el dueño califica a quien recibe una donacion (esa persona no publico ningun articulo).
-- Los puntos se calculan (en vistas se explica).
create table if not exists calificaciones(
  idcalificacion int auto_increment primary key,
  idsolicitud int not null,
  idevaluador int not null,
  idevaluado int not null,
  puntualidad tinyint not null,
  actitud tinyint not null,
  veracidad tinyint null,
  comentario varchar(255) null,
  fecha datetime not null default current_timestamp,
  unique key uq_calif (idsolicitud, idevaluador),
  constraint fk_cal_solicitud foreign key (idsolicitud)
    references solicitudes(idsolicitud),
  constraint fk_cal_evaluador foreign key (idevaluador)
    references usuarios(idusuario),
  constraint fk_cal_evaluado foreign key (idevaluado)
    references usuarios(idusuario),
  constraint ck_cal_puntualidad check (puntualidad between 0 and 5),
  constraint ck_cal_actitud check (actitud between 0 and 5),
  constraint ck_cal_veracidad check (veracidad is null or veracidad between 0 and 5),
  constraint ck_cal_distintos check (idevaluador <> idevaluado),
  index idx_cal_evaluado (idevaluado)
) engine=InnoDB;

-- 9. MOTIVOS DE REPORTE (las opciones de la lista del formulario)
-- tipo indica si el motivo aplica a publicaciones o a perfiles.
-- "descripcion" es un texto opcional.
create table if not exists motivos_reporte(
  idmotivo int auto_increment primary key,
  nombre varchar(100) not null,
  tipo enum('publicacion','perfil') not null,
  descripcion varchar(255) null,
  unique key uq_motivo (nombre, tipo)
) engine=InnoDB;

-- 10. REPORTES (de una publicacion O de un perfil, nunca ambos)
-- Que el motivo coincida con el tipo de reporte lo valida la aplicacion.
create table if not exists reportes(
  idreporte int auto_increment primary key,
  idreportante int not null,
  idpublicacion int null,                 -- si se reporta una publicacion
  idusuario_reportado int null,           -- si se reporta un perfil
  idmotivo int not null,
  comentario varchar(500) null,           -- texto libre opcional
  estado enum('pendiente','desestimado','resuelto') not null default 'pendiente',
  fecha datetime not null default current_timestamp,
  idadmin int null,                       -- quien lo resolvio
  constraint fk_rep_reportante foreign key (idreportante)
    references usuarios(idusuario),
  constraint fk_rep_publicacion foreign key (idpublicacion)
    references publicaciones(idpublicacion),
  constraint fk_rep_reportado foreign key (idusuario_reportado)
    references usuarios(idusuario),
  constraint fk_rep_motivo foreign key (idmotivo)
    references motivos_reporte(idmotivo),
  constraint fk_rep_admin foreign key (idadmin)
    references usuarios(idusuario) on delete set null,
  constraint ck_rep_un_destino check
    ((idpublicacion is not null) + (idusuario_reportado is not null) = 1),
  constraint ck_rep_no_a_si_mismo check
    (idusuario_reportado is null or idusuario_reportado <> idreportante),
  index idx_rep_estado (estado)
) engine=InnoDB;

-- 11. SANCIONES
create table if not exists sanciones(
  idsancion int auto_increment primary key,
  idusuario int not null,                 -- usuario sancionado
  idreporte int null,
  idadmin int not null,
  tipo enum('advertencia','suspension','baneo') not null,
  motivo varchar(255) not null,
  fecha datetime not null default current_timestamp,
  fecha_fin datetime null,                -- solo para suspensiones
  -- Revertir una sancion (el admin se equivoco o aprobo una apelacion): NO se borra, se marca.
  -- Una sancion revertida deja de tener efecto (un baneo revertido reactiva la cuenta).
  fecha_revertida datetime null,
  idadmin_reversion int null,
  constraint fk_san_usuario foreign key (idusuario)
    references usuarios(idusuario),
  constraint fk_san_reporte foreign key (idreporte)
    references reportes(idreporte) on delete set null,
  constraint fk_san_admin foreign key (idadmin)
    references usuarios(idusuario),
  constraint fk_san_reversion foreign key (idadmin_reversion)
    references usuarios(idusuario) on delete set null
) engine=InnoDB;

-- 12. APELACIONES (el usuario sancionado explica por que cree que fue un error)
-- Una sola apelacion por sancion (uq_apelacion_sancion). Como el usuario baneado no puede iniciar sesion,
-- la apelacion se envia desde la pantalla de login comprobando su correo y contrasena.
create table if not exists apelaciones(
  idapelacion int auto_increment primary key,
  idsancion int not null,
  mensaje varchar(500) not null,
  estado enum('pendiente','aceptada','rechazada') not null default 'pendiente',
  respuesta varchar(255) null,            -- lo que le contesta el admin
  fecha datetime not null default current_timestamp,
  fecha_resolucion datetime null,
  idadmin int null,
  unique key uq_apelacion_sancion (idsancion),
  constraint fk_apel_sancion foreign key (idsancion)
    references sanciones(idsancion) on delete cascade,
  constraint fk_apel_admin foreign key (idadmin)
    references usuarios(idusuario) on delete set null,
  index idx_apel_estado (estado)
) engine=InnoDB;

-- 13. TOKENS REVOCADOS (lista negra del JWT)
-- Ya NO hay tabla sessions ni express-session: la autenticacion es solo JWT.
-- Al cerrar sesion se guarda aqui el jti (id unico) del token para que ya no se acepte,
-- aunque todavia no haya vencido. 'expira' permite borrar filas viejas (un token vencido
-- ya no se puede usar, asi que no hace falta recordarlo).
create table if not exists tokens_revocados(
  jti varchar(64) primary key,
  idusuario int not null,
  expira datetime not null,
  revocado_en datetime not null default current_timestamp,
  constraint fk_tok_usuario foreign key (idusuario)
    references usuarios(idusuario) on delete cascade
) engine=InnoDB;

-- VISTAS: Tablas virtuales basadas en consultas. 
-- No almacenan datos físicamente, solo guardan la consulta (select) para facilitar la lectura y evitar repetir código complejo.
-- Reputacion: promedio de todas las calificaciones recibidas, en escala 0 a 10 (promedio de criterios de 0 a 5, multiplicado por 2).
-- Si veracidad es NULL, ese criterio no cuenta en el promedio.
create or replace view vista_reputacion as
select
  u.idusuario,
  count(c.idcalificacion) as total_calificaciones,
  round(avg(
    (c.puntualidad + c.actitud + ifnull(c.veracidad, 0))
    / (2 + (c.veracidad is not null))
  ) * 2, 1) as puntos_confianza
from usuarios u
left join calificaciones c on c.idevaluado = u.idusuario
group by u.idusuario;

-- "Puntuaciones pendientes": solicitudes completadas donde la persona aun no ha calificado a la otra.
create or replace view vista_calificaciones_pendientes as
select s.idsolicitud, s.idsolicitante as idevaluador, p.idusuario as idevaluado
from solicitudes s
join publicaciones p on p.idpublicacion = s.idpublicacion
where s.estado = 'completada'
  and not exists (select 1 from calificaciones c
                  where c.idsolicitud = s.idsolicitud
                    and c.idevaluador = s.idsolicitante)
union all
select s.idsolicitud, p.idusuario, s.idsolicitante
from solicitudes s
join publicaciones p on p.idpublicacion = s.idpublicacion
where s.estado = 'completada'
  and not exists (select 1 from calificaciones c
                  where c.idsolicitud = s.idsolicitud
                    and c.idevaluador = p.idusuario);

--  DATOS INICIALES
insert ignore into categorias (nombre, descripcion, requiere_sellado, permite_caducidad) values
  ('Pañales de bebé', 'Todas las tallas y etapas', false, true),
  ('Ropa de bebé', 'Prendas de 0 a 24 meses', false, false),
  ('Accesorios de bebé', 'Carriolas, cunas, sillas, etc.', false, false),
  ('Insumos de bebé', 'Sellados: fórmula, papillas, etc.', true, true),
  ('Pañales para adulto', 'Todas las tallas y absorciones', false, true),
  ('Ropa para adulto mayor', 'Prendas cómodas', false, false),
  ('Apoyos y equipos de cuidado', 'Andadores, bastones, tensiómetros, etc.', false, false),
  ('Insumos para adulto mayor', 'Sellados: alimentos, fórmulas, etc.', true, true);

insert ignore into alcaldias (nombre) values
  ('Álvaro Obregón'), ('Azcapotzalco'), ('Benito Juárez'), ('Coyoacán'),
  ('Cuajimalpa'), ('Cuauhtémoc'), ('Gustavo A. Madero'), ('Iztacalco'),
  ('Iztapalapa'), ('Magdalena Contreras'), ('Miguel Hidalgo'),
  ('Milpa Alta'), ('Tláhuac'), ('Tlalpan'), ('Venustiano Carranza'),
  ('Xochimilco');

insert ignore into motivos_reporte (nombre, tipo, descripcion) values
  ('Artículo no permitido', 'publicacion', 'Celulares, medicamentos, productos de higiene abiertos, etc.'),
  ('Título o descripción inapropiados', 'publicacion', null),
  ('Foto inapropiada o que no corresponde', 'publicacion', null),
  ('Información falsa o engañosa', 'publicacion', null),
  ('Están pidiendo dinero a cambio', 'publicacion', null),
  ('Otro', 'publicacion', null),
  ('Foto de perfil inapropiada', 'perfil', null),
  ('Nombre inapropiado', 'perfil', null),
  ('Descripción inapropiada', 'perfil', null),
  ('Publicaciones inapropiadas', 'perfil', null),
  ('Acoso o comportamiento indebido', 'perfil', null),
  ('Cuenta falsa o suplantación', 'perfil', null),
  ('Están pidiendo dinero a cambio', 'perfil', null),
  ('Otro', 'perfil', null);