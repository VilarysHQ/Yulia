import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { requireAllowedOrigin } from './csrf.js';
import { createMvpRouter } from './mvp.js';
import { createChatRouter } from './chat.js';
import { createTeacherRouter } from './teacher.js';

export function createApp(options = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.ALLOWED_ORIGINS, credentials: true }));
  app.use(requireAllowedOrigin(env.ALLOWED_ORIGINS));
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/health', (_request, response) => {
    response.json({
      status: 'ok',
      service: 'bioquimica-nutricional-api',
      phase: 2,
    });
  });

  app.use('/api', createMvpRouter(options));
  app.use('/api/teacher', createTeacherRouter());
  app.use('/api', createChatRouter(options));

  app.use('/api', (_request, response) => {
    response.status(404).json({ error: 'Recurso no encontrado' });
  });

  app.use((_error, _request, response, _next) => {
    console.error('Error interno del servidor');
    response.status(500).json({ error: 'Error interno del servidor' });
  });

  return app;
}

const app = createApp();

export default app;
