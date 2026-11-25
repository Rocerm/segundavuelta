// Ventana para reportar una publicación o un perfil. Se usa desde publicacion.html y perfil.html:
//   Reportes.abrir('publicacion', idpublicacion)    Reportes.abrir('perfil', idusuario)
const Reportes = {
  async abrir(tipo, id) {
    let motivos;
    try { motivos = await API.get('/catalogos/motivos?tipo=' + tipo); } catch (error) { return mostrarError(error); }

    const dialogo = document.createElement('dialog');
    dialogo.innerHTML = `<form method="dialog" id="form-reporte" novalidate>
      <h2>Reportar ${tipo === 'perfil' ? 'perfil' : 'publicación'}</h2>
      <label for="rep-motivo">Motivo</label>
      <select id="rep-motivo" required>${motivos.map((m) => `<option value="${m.idmotivo}">${esc(m.nombre)}</option>`).join('')}</select>
      <label for="rep-coment">Comentario (opcional)</label>
      <textarea id="rep-coment" maxlength="500"></textarea>
      <div class="acciones"><button class="boton peligro" type="submit">Enviar reporte</button>
      <button class="boton claro" type="button" id="rep-cancelar">Cancelar</button></div></form>`;
    document.body.appendChild(dialogo);
    dialogo.showModal();
    dialogo.querySelector('#rep-cancelar').addEventListener('click', () => { dialogo.close(); dialogo.remove(); });

    dialogo.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const coment = dialogo.querySelector('#rep-coment');
      if (coment.value.trim() && !revisar([[coment, Validar.texto(coment.value, 'El comentario', 1, 500)]])) return;
      const cuerpo = { idmotivo: dialogo.querySelector('#rep-motivo').value, comentario: dialogo.querySelector('#rep-coment').value };
      if (tipo === 'perfil') cuerpo.idusuario_reportado = id; else cuerpo.idpublicacion = id;
      try {
        const r = await API.post('/reportes', cuerpo);
        aviso(r.mensaje);
        dialogo.close(); dialogo.remove();
      } catch (error) { mostrarError(error); }
    });
  },
};
