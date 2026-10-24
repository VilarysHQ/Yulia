export function storageWritesAvailable(mode, baseUrl, serviceKey) {
  return mode === 'production' && Boolean(baseUrl && serviceKey);
}
