const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Clients without a browser Origin must send an explicitly allowed Origin too.
export function requireAllowedOrigin(allowedOrigins) {
  const allowed = new Set(allowedOrigins);
  return (request, response, next) => {
    if (!WRITE_METHODS.has(request.method)) return next();
    const origin = request.get('origin');
    if (!origin || !allowed.has(origin)) {
      return response.status(403).json({ error: 'Origen no autorizado' });
    }
    return next();
  };
}
