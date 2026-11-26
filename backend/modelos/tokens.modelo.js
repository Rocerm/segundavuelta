function crearModeloTokens(pool) {
  async function revocar(jti, idusuario, exp) {
    await pool.query(
      'INSERT INTO tokens_revocados (jti, idusuario, expira) VALUES (?, ?, to_timestamp(?)) ON CONFLICT (jti) DO NOTHING',
      [jti, idusuario, exp]
    );
  }

  async function estaRevocado(jti) {
    const [filas] = await pool.query('SELECT 1 FROM tokens_revocados WHERE jti = ?', [String(jti || '')]);
    return filas.length > 0;
  }

  async function limpiarVencidos() {
    const [r] = await pool.query('DELETE FROM tokens_revocados WHERE expira < NOW()');
    return r.affectedRows;
  }

  return { revocar, estaRevocado, limpiarVencidos };
}

module.exports = { crearModeloTokens };
