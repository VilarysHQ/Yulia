export function validateDatabaseTarget(config) {
  if (config.NODE_ENV === 'production') return;
  const expected = config.NODE_ENV === 'test' ? 'yulia_test' : 'yulia_dev';
  if (!config.DATABASE_URL) throw new Error(`Configura DATABASE_URL para ${expected}`);
  let url;
  try { url = new URL(config.DATABASE_URL); }
  catch { throw new Error('DATABASE_URL no es una URL PostgreSQL válida'); }
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!['localhost', '127.0.0.1', '::1'].includes(host)
    || !['postgres:', 'postgresql:'].includes(url.protocol)
    || url.port !== '5432' || url.pathname !== `/${expected}`
    || url.username !== 'postgres' || url.search || url.hash) {
    throw new Error(`Destino PostgreSQL no autorizado para ${config.NODE_ENV}; solo loopback:5432/${expected}`);
  }
  if (!url.password) throw new Error(`Configura la contraseña local de PostgreSQL en DATABASE_URL para ${expected}`);
  if (config.DATABASE_SSL) throw new Error('DATABASE_SSL debe ser false para PostgreSQL local');
}
