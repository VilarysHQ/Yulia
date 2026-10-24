# Bioquímica Nutricional · MVP

Aplicación React/Vite y API Express con PostgreSQL. Docentes crean cursos y simulaciones; estudiantes se inscriben y conversan con Gemini en simulaciones publicadas usando su propia API key.

## Requisitos

- Node.js 20 o superior
- pnpm 9 o superior
- PostgreSQL 15 o superior

## Arranque local

1. Usa la base local `yulia_dev` en `127.0.0.1:5432`. No uses la base de producción ni la copia con datos reales para pruebas de integración.
2. Configura `apps/api/.env` con `DATABASE_URL=postgresql://postgres:<contraseña-local>@127.0.0.1:5432/yulia_dev`, `DATABASE_SSL=false` y un `JWT_SECRET` local. Codifica en formato URL los símbolos especiales de la contraseña. No pongas secretos en archivos versionados. La API rechaza destinos remotos y variables heredadas que difieran de este archivo.
3. Ejecuta `pnpm install`.
4. Si la base es una restauración existente, revisa sus migraciones antes de aplicar cambios. En esta etapa no ejecutes `pnpm db:migrate` sobre `yulia_dev`.
5. Ejecuta `pnpm dev` y abre `http://localhost:5173` cuando hayas configurado la contraseña local.

La web usa `http://localhost:3001/api` por defecto. Para otra URL, crea `apps/web/.env` con `VITE_API_URL` antes de iniciar Vite. Permite cookies y configura `WEB_ORIGIN` con el origen exacto de la web.

En producción, configura `JWT_SECRET` explícitamente con un valor aleatorio propio de al menos 32 caracteres y `WEB_ORIGIN` con el origen HTTPS exacto del frontend. La API rechaza secretos de ejemplo y no carga el archivo local `.env` en producción. Si hay varios frontends autorizados, usa `WEB_ORIGINS` como lista completa separada por comas; sustituye `WEB_ORIGIN`, no lo amplía. No uses rutas, comodines ni `null`. CORS y la protección CSRF usan esa misma lista. Todas las peticiones `POST`, `PUT`, `PATCH` y `DELETE`, incluidas las públicas como registro e inicio de sesión, requieren un encabezado `Origin` que coincida exactamente. Los clientes no navegador deben enviarlo explícitamente. `GET`, `HEAD` y preflight `OPTIONS` mantienen su comportamiento habitual. Verifica que las variables de Vercel apunten al frontend y a la base de producción correctos antes de desplegar.

Para los dos proyectos de Vercel, usa `apps/web` como Root Directory del frontend Vite (`dist` como Output Directory) y `apps/api` para Express. `apps/web/vercel.json` reescribe las rutas de React Router a `/index.html`. Variables por entorno: frontend `VITE_API_URL` con la URL HTTPS pública de la API terminada en `/api`; backend `NODE_ENV=production`, `DATABASE_URL` de PostgreSQL de producción, `DATABASE_SSL` según la conexión de Supabase, `JWT_SECRET` existente, y `WEB_ORIGIN` o `WEB_ORIGINS` con el origen HTTPS exacto del frontend. Para portadas de curso en producción, configura `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y, si corresponde, `SUPABASE_STORAGE_BUCKET`. `GEMINI_MODEL` es opcional. Verifica los valores en Vercel sin copiarlos al repositorio; en especial, confirma que la URL de base de datos no apunta a `yulia_dev` ni a `yulia_test`.

## Portadas de curso

En producción, las portadas se suben directamente desde el navegador a Supabase Storage con una URL firmada. La API usa la service role key solo en producción. En desarrollo y pruebas se muestran las URLs públicas existentes, pero crear, confirmar o eliminar portadas está deshabilitado.

1. Crea un bucket público llamado `course-covers`.
2. Limita el bucket a 2 MB y a los tipos `image/jpeg`, `image/png` e `image/webp`.
3. No añadas políticas de escritura pública: las subidas se autorizan con URLs firmadas generadas por el backend.
4. Configura `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` solo en el entorno de producción. En local, `SUPABASE_URL` basta para mostrar portadas públicas existentes.

## Recorrido de prueba

1. Crea una cuenta con rol **Docente** e inicia sesión.
2. En **Mis cursos**, crea un curso disponible para estudiantes.
3. Abre el curso, crea una simulación y publícala con la casilla del formulario o el botón del listado.
4. Pulsa **Salir** y crea una cuenta con rol **Estudiante**.
5. Abre el curso, pulsa **Inscribirme** y entra en la simulación.
6. Introduce tu API key de Gemini y pulsa **Probar conexión**. Luego pulsa **Iniciar simulación** y conversa con el tutor.
7. Recarga la página o reinicia `pnpm dev` y comprueba que la conversación continúa allí.

El estudiante nunca recibe los borradores ni las instrucciones internas del tutor en la interfaz. Las operaciones docentes se filtran por el ID del usuario autenticado en la API.

La clave de Gemini se guarda temporalmente en `sessionStorage` para la pestaña y el usuario actual, y se borra al cerrar sesión o al usar **Eliminar de esta sesión**. Se envía al backend únicamente en las peticiones a Gemini; no se guarda en PostgreSQL ni se incluye en respuestas o registros. El historial sí persiste. Configura `GEMINI_MODEL` en `apps/api/.env` si necesitas cambiar el modelo de texto (valor inicial: `gemini-3.5-flash-lite`).

## Verificación

`pnpm --filter @bioquimica/api test:unit` ejecuta pruebas puras sin base de datos. Para ejecutar `pnpm test` o `pnpm check`, primero crea manualmente la base vacía `yulia_test`, copia `apps/api/.env.test.example` a `apps/api/.env.test` y configura allí la contraseña local. Revisa que el destino sea `127.0.0.1:5432/yulia_test`; con `NODE_ENV=test`, aplica las migraciones explícitamente mediante `pnpm db:migrate` solo después de esa comprobación. La suite de integración crea y borra registros de prueba, por lo que nunca debe usar `yulia_dev` ni una base remota. Si falta `.env.test` o se hereda una URL distinta, el comando falla antes de ejecutar los tests. La prueba automática del chat usa un proveedor simulado; para verificar una respuesta real se necesita una API key propia de Gemini.

## Datos

Se reutilizan `users`, `clinical_cases`, `simulation_sessions` y `conversation_messages` de la migración inicial. La migración `002` añade `courses`, `enrollments` y `clinical_cases.course_id`. La migración `003` limita a una sesión activa por estudiante y simulación. Las tablas de evaluación y supervisión siguen sin uso. Las pantallas demo antiguas permanecen en el repositorio como referencia, pero no forman parte del enrutado activo.
