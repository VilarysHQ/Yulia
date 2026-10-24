import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createElement } from 'react';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({ root, configFile: path.join(root, 'vite.config.js'), server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { App } = await server.ssrLoadModule('/src/App.jsx');
  const checks = [
    ['/', 'casos y simulaciones'],
    ['/acceso', 'Iniciar sesión'],
    ['/registro', 'Crear cuenta'],
    ['/docente', 'Cargando sesión'],
    ['/docente/seguimiento', 'Cargando sesión'],
    ['/estudiante', 'Cargando sesión'],
    ['/no-existe', 'Página no encontrada'],
  ];
  const originalError = console.error;
  console.error = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect')) return;
    originalError(...args);
  };
  for (const [route, expected] of checks) {
    const html = renderToString(createElement(MemoryRouter, { initialEntries: [route] }, createElement(App)));
    assert.ok(html.includes(expected), `${route}: falta ${expected}`);
    assert.ok(!html.includes('[object Object]'), `${route}: objeto en texto visible`);
    console.log(`OK ${route}`);
  }
  const { TeacherTrackingPage } = await server.ssrLoadModule('/src/mvp/TeacherTrackingPage.jsx');
  const tracking = renderToString(createElement(MemoryRouter, null, createElement(TeacherTrackingPage)));
  for (const expected of ['Seguimiento académico', 'Actividad por simulación', 'Resumen rápido', 'Conversaciones recientes', 'Limpiar filtros', 'tracking-tab-students']) {
    assert.ok(tracking.includes(expected), `Dashboard docente: falta ${expected}`);
  }
  assert.ok(!tracking.includes('min-w-[850px]'), 'Dashboard docente: tabla con ancho mínimo fijo');
  console.log('OK dashboard docente: estructura inicial y filtros');
  console.error = originalError;
  console.log(`Rutas renderizadas: ${checks.length}/${checks.length}`);
} finally { await server.close(); }
