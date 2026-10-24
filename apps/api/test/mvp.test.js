import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { query } from '../src/db.js';
import { createTestTeacher } from '../test-support/helpers.js';

test('flujo persistente docente → estudiante y permisos', { skip: process.env.NODE_ENV !== 'test' }, async () => {
  const marker = randomUUID();
  const created = { users: [], course: null, simulation: null };
  let server;
  let base;
  const start = async () => {
    server = createApp().listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}/api`;
  };
  const stop = async () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  const call = async (path, method = 'GET', body, cookie) => {
    const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Origin: env.ALLOWED_ORIGINS[0], ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = response.status === 204 ? null : await response.json();
    return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };
  await start();
  try {
    const password = 'Password123!';
    const teacherUser = await createTestTeacher({ name: 'Docente MVP', email: `teacher-${marker}@example.test`, password });
    created.users.push(teacherUser.id);
    const teacher = await call('/auth/login', 'POST', { email: teacherUser.email, password });
    assert.equal(teacher.status, 200);
    const teacherCookie = teacher.cookie;
    assert.equal((await call('/auth/me', 'GET', null, teacherCookie)).data.user.role, 'teacher');
    const hash = await query('SELECT password_hash FROM users WHERE id = $1', [teacherUser.id]);
    assert.notEqual(hash.rows[0].password_hash, password);

    assert.equal((await call('/courses', 'POST', { title: 'Curso sin portada', description: '', published: true }, teacherCookie)).status, 400);
    const course = await call('/courses', 'POST', { title: 'Curso de prueba MVP', description: 'Curso persistente', published: false }, teacherCookie);
    assert.equal(course.status, 201);
    created.course = course.data.course.id;
    await query('UPDATE courses SET cover_image_path = $1 WHERE id = $2', [`courses/${created.course}/${randomUUID()}.png`, created.course]);
    const coursePublication = await call(`/courses/${created.course}`, 'PATCH', { published: true }, teacherCookie);
    assert.equal(coursePublication.status, 200);
    assert.equal(coursePublication.data.course.published, true);
    const simulation = await call(`/courses/${created.course}/simulations`, 'POST', { title: 'Simulación de prueba', scenario: 'Escenario de diez caracteres o más.', objective: 'Razonar el caso', tutorInstructions: 'Guiar mediante preguntas.', published: false }, teacherCookie);
    assert.equal(simulation.status, 201);
    created.simulation = simulation.data.simulation.id;
    const publication = await call(`/simulations/${created.simulation}`, 'PATCH', { published: true }, teacherCookie);
    assert.equal(publication.status, 200);
    assert.equal(publication.data.simulation.published, true);

    const otherUser = await createTestTeacher({ name: 'Otra docente', email: `other-${marker}@example.test`, password });
    created.users.push(otherUser.id);
    const other = await call('/auth/login', 'POST', { email: otherUser.email, password });
    assert.equal(other.status, 200);
    assert.equal((await call(`/courses/${created.course}`, 'PATCH', { title: 'Intrusión' }, other.cookie)).status, 404);
    assert.equal((await call(`/simulations/${created.simulation}`, 'PATCH', { title: 'Intrusión' }, other.cookie)).status, 404);

    const student = await call('/auth/register', 'POST', { name: 'Estudiante MVP', email: `student-${marker}@example.test`, password, role: 'student' });
    assert.equal(student.status, 201);
    created.users.push(student.data.user.id);
    assert.equal((await call('/courses', 'GET', null, student.cookie)).data.courses.some((item) => item.id === created.course), true);
    assert.equal((await call(`/simulations/${created.simulation}`, 'GET', null, student.cookie)).status, 404);
    assert.equal((await call(`/courses/${created.course}/enroll`, 'POST', null, student.cookie)).status, 200);
    const list = await call(`/courses/${created.course}/simulations`, 'GET', null, student.cookie);
    assert.equal(list.data.simulations.length, 1);
    assert.equal(list.data.simulations[0].title, 'Simulación de prueba');
    const detail = await call(`/simulations/${created.simulation}`, 'GET', null, student.cookie);
    assert.equal(detail.status, 200);
    assert.equal(detail.data.simulation.scenario, 'Escenario de diez caracteres o más.');
    assert.equal(detail.data.simulation.tutorInstructions, undefined);
    assert.equal((await call('/courses', 'POST', { title: 'Prohibido', description: '' }, student.cookie)).status, 403);

    await stop();
    await start();
    const loggedTeacher = await call('/auth/login', 'POST', { email: `teacher-${marker}@example.test`, password });
    assert.equal(loggedTeacher.status, 200);
    const persisted = await call(`/courses/${created.course}/simulations`, 'GET', null, loggedTeacher.cookie);
    assert.equal(persisted.data.simulations[0].id, created.simulation);
    assert.equal(persisted.data.simulations[0].published, true);
    const loggedStudent = await call('/auth/login', 'POST', { email: `student-${marker}@example.test`, password });
    assert.equal((await call(`/courses/${created.course}/simulations`, 'GET', null, loggedStudent.cookie)).data.simulations.length, 1);
  } finally {
    await stop();
    if (created.course) await query('DELETE FROM enrollments WHERE course_id = $1', [created.course]);
    if (created.simulation) await query('DELETE FROM clinical_cases WHERE id = $1', [created.simulation]);
    if (created.course) await query('DELETE FROM courses WHERE id = $1', [created.course]);
    for (const id of created.users) await query('DELETE FROM users WHERE id = $1', [id]);
  }
});

// --- Borrado de simulaciones y cursos por el docente -------------------------

const PASSWORD = 'Password123!';

function newHarness() {
  let server;
  let base;
  const users = [];
  const courses = [];
  const simulations = [];
  return {
    users,
    courses,
    simulations,
    async start() {
      server = createApp().listen(0);
      await new Promise((resolve) => server.once('listening', resolve));
      base = `http://127.0.0.1:${server.address().port}/api`;
    },
    async stop() {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
    async call(path, method = 'GET', body, cookie) {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Origin: env.ALLOWED_ORIGINS[0], ...(cookie ? { Cookie: cookie } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = response.status === 204 ? null : await response.json().catch(() => null);
      return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
    },
  };
}

async function registerUser(harness, role, label, marker) {
  const email = `${label}-${marker}@example.test`;
  if (role === 'teacher') {
    const user = await createTestTeacher({ name: label, email, password: PASSWORD });
    harness.users.push(user.id);
    const login = await harness.call('/auth/login', 'POST', { email, password: PASSWORD });
    assert.equal(login.status, 200);
    return login;
  }
  const response = await harness.call('/auth/register', 'POST', { name: label, email, password: PASSWORD, role });
  assert.equal(response.status, 201);
  harness.users.push(response.data.user.id);
  return response;
}

async function createCourse(harness, cookie, title) {
  const response = await harness.call('/courses', 'POST', { title, description: '', published: false }, cookie);
  assert.equal(response.status, 201);
  const courseId = response.data.course.id;
  harness.courses.push(courseId);
  await query('UPDATE courses SET cover_image_path = $1 WHERE id = $2', [`courses/${courseId}/${randomUUID()}.png`, courseId]);
  assert.equal((await harness.call(`/courses/${courseId}`, 'PATCH', { published: true }, cookie)).status, 200);
  return courseId;
}

async function createSimulation(harness, cookie, courseId, title) {
  const response = await harness.call(`/courses/${courseId}/simulations`, 'POST', {
    title,
    scenario: 'Escenario de prueba con más de diez caracteres.',
    objective: 'Razonar el caso',
    tutorInstructions: 'Guiar con preguntas.',
    published: true,
  }, cookie);
  assert.equal(response.status, 201);
  harness.simulations.push(response.data.simulation.id);
  return response.data.simulation.id;
}

async function seedActivity(simulationId, studentId, { evaluation = true } = {}) {
  const session = await query(`INSERT INTO simulation_sessions (student_id, clinical_case_id, case_version, status, started_at, last_activity_at)
    VALUES ($1, $2, 1, 'created', now(), now()) RETURNING id`, [studentId, simulationId]);
  const sessionId = session.rows[0].id;
  await query(`INSERT INTO conversation_messages (session_id, role, stage, content, sequence_number)
    VALUES ($1, 'student', 'inicio', 'Mi razonamiento', 1), ($1, 'tutor', 'inicio', '¿Qué analizarías?', 2)`, [sessionId]);
  let evaluationId = null;
  if (evaluation) {
    const created = await query(`INSERT INTO evaluations (session_id, final_score, global_level, personalized_feedback)
      VALUES ($1, 15.5, 'bueno', 'Buen razonamiento') RETURNING id`, [sessionId]);
    evaluationId = created.rows[0].id;
    await query(`INSERT INTO rubric_scores (evaluation_id, criterion_key, criterion_label, score, achievement_level, evidence)
      VALUES ($1, 'k1', 'Criterio', 4.5, 'logrado', 'evidencia')`, [evaluationId]);
  }
  await query(`INSERT INTO supervision_events (session_id, student_id, event_type, occurred_at, client_event_id)
    VALUES ($1, $2, 'window_left', now(), $3)`, [sessionId, studentId, randomUUID()]);
  await query(`INSERT INTO recording_metadata (session_id, consented_at, storage_key, mime_type, status)
    VALUES ($1, now(), $2, 'video/webm', 'ready')`, [sessionId, randomUUID()]);
  return { sessionId, evaluationId };
}

async function countRows(table, column, value) {
  const { rows } = await query(`SELECT count(*)::int AS n FROM ${table} WHERE ${column} = $1`, [value]);
  return rows[0].n;
}

async function purgeSimulation(id) {
  const sessions = 'SELECT id FROM simulation_sessions WHERE clinical_case_id = $1';
  await query(`DELETE FROM rubric_scores WHERE evaluation_id IN (SELECT e.id FROM evaluations e WHERE e.session_id IN (${sessions}))`, [id]);
  await query(`DELETE FROM evaluations WHERE session_id IN (${sessions})`, [id]);
  await query(`DELETE FROM recording_metadata WHERE session_id IN (${sessions})`, [id]);
  await query(`DELETE FROM supervision_events WHERE session_id IN (${sessions})`, [id]);
  await query(`DELETE FROM conversation_messages WHERE session_id IN (${sessions})`, [id]);
  await query('DELETE FROM simulation_sessions WHERE clinical_case_id = $1', [id]);
  await query('DELETE FROM clinical_cases WHERE id = $1', [id]);
}

async function purgeCourse(id) {
  const sessions = 'SELECT id FROM simulation_sessions WHERE clinical_case_id IN (SELECT id FROM clinical_cases WHERE course_id = $1)';
  await query(`DELETE FROM rubric_scores WHERE evaluation_id IN (SELECT e.id FROM evaluations e WHERE e.session_id IN (${sessions}))`, [id]);
  await query(`DELETE FROM evaluations WHERE session_id IN (${sessions})`, [id]);
  await query(`DELETE FROM recording_metadata WHERE session_id IN (${sessions})`, [id]);
  await query(`DELETE FROM supervision_events WHERE session_id IN (${sessions})`, [id]);
  await query(`DELETE FROM conversation_messages WHERE session_id IN (${sessions})`, [id]);
  await query('DELETE FROM simulation_sessions WHERE clinical_case_id IN (SELECT id FROM clinical_cases WHERE course_id = $1)', [id]);
  await query('DELETE FROM clinical_cases WHERE course_id = $1', [id]);
  await query('DELETE FROM enrollments WHERE course_id = $1', [id]);
  await query('DELETE FROM courses WHERE id = $1', [id]);
}

async function teardown(harness) {
  for (const id of harness.courses) { try { await purgeCourse(id); } catch { /* ya eliminado */ } }
  for (const id of harness.simulations) { try { await purgeSimulation(id); } catch { /* ya eliminado */ } }
  for (const id of harness.users) { try { await query('DELETE FROM users WHERE id = $1', [id]); } catch { /* ya eliminado */ } }
}

test('el docente borra simulaciones: historial, aislamiento y permisos', { skip: process.env.NODE_ENV !== 'test' }, async () => {
  const marker = randomUUID();
  const harness = newHarness();
  await harness.start();
  try {
    const teacher = await registerUser(harness, 'teacher', 'Docente', marker);
    const other = await registerUser(harness, 'teacher', 'Otra', marker);
    const student = await registerUser(harness, 'student', 'Estudiante', marker);
    const studentId = student.data.user.id;

    const courseId = await createCourse(harness, teacher.cookie, 'Curso con simulaciones');
    const emptySim = await createSimulation(harness, teacher.cookie, courseId, 'Simulación sin actividad');
    const busySim = await createSimulation(harness, teacher.cookie, courseId, 'Simulación con actividad');
    const keepSim = await createSimulation(harness, teacher.cookie, courseId, 'Simulación intacta');

    const { sessionId, evaluationId } = await seedActivity(busySim, studentId);

    assert.equal((await harness.call(`/simulations/${busySim}`, 'DELETE', null, student.cookie)).status, 403);
    assert.equal((await harness.call(`/simulations/${busySim}`, 'DELETE', null, other.cookie)).status, 404);

    assert.equal((await harness.call(`/simulations/${emptySim}`, 'DELETE', null, teacher.cookie)).status, 204);
    assert.equal(await countRows('clinical_cases', 'id', emptySim), 0);

    assert.equal((await harness.call(`/simulations/${busySim}`, 'DELETE', null, teacher.cookie)).status, 204);
    assert.equal(await countRows('clinical_cases', 'id', busySim), 0);
    assert.equal(await countRows('simulation_sessions', 'id', sessionId), 0);
    assert.equal(await countRows('conversation_messages', 'session_id', sessionId), 0);
    assert.equal(await countRows('evaluations', 'session_id', sessionId), 0);
    assert.equal(await countRows('rubric_scores', 'evaluation_id', evaluationId), 0);
    assert.equal(await countRows('supervision_events', 'session_id', sessionId), 0);
    assert.equal(await countRows('recording_metadata', 'session_id', sessionId), 0);

    assert.equal(await countRows('clinical_cases', 'id', keepSim), 1);
    assert.equal((await harness.call(`/simulations/${keepSim}`, 'DELETE', null, teacher.cookie)).status, 204);
    assert.equal(await countRows('clinical_cases', 'id', keepSim), 0);

    assert.equal(await countRows('users', 'id', studentId), 1);
    assert.equal(await countRows('users', 'id', teacher.data.user.id), 1);
  } finally {
    await harness.stop();
    await teardown(harness);
  }
});

test('el docente borra cursos: contenido, inscripciones, historial y usuarios', { skip: process.env.NODE_ENV !== 'test' }, async () => {
  const marker = randomUUID();
  const harness = newHarness();
  await harness.start();
  try {
    const teacher = await registerUser(harness, 'teacher', 'Docente', marker);
    const other = await registerUser(harness, 'teacher', 'Otra', marker);
    const student = await registerUser(harness, 'student', 'Estudiante', marker);
    const studentId = student.data.user.id;

    const emptyCourse = await createCourse(harness, teacher.cookie, 'Curso vacío');
    assert.equal((await harness.call(`/courses/${emptyCourse}`, 'DELETE', null, student.cookie)).status, 403);
    assert.equal((await harness.call(`/courses/${emptyCourse}`, 'DELETE', null, teacher.cookie)).status, 204);
    assert.equal(await countRows('courses', 'id', emptyCourse), 0);

    const courseId = await createCourse(harness, teacher.cookie, 'Curso completo');
    const simA = await createSimulation(harness, teacher.cookie, courseId, 'Simulación A');
    const simB = await createSimulation(harness, teacher.cookie, courseId, 'Simulación B');
    assert.equal((await harness.call(`/courses/${courseId}/enroll`, 'POST', null, student.cookie)).status, 200);

    const first = await seedActivity(simA, studentId);
    const second = await seedActivity(simB, studentId, { evaluation: false });

    assert.equal((await harness.call(`/courses/${courseId}`, 'DELETE', null, other.cookie)).status, 404);
    assert.equal((await harness.call(`/courses/${courseId}`, 'DELETE', null, student.cookie)).status, 403);

    assert.equal((await harness.call(`/courses/${courseId}`, 'DELETE', null, teacher.cookie)).status, 204);

    assert.equal(await countRows('courses', 'id', courseId), 0);
    assert.equal(await countRows('clinical_cases', 'course_id', courseId), 0);
    assert.equal(await countRows('enrollments', 'course_id', courseId), 0);
    assert.equal(await countRows('simulation_sessions', 'id', first.sessionId), 0);
    assert.equal(await countRows('simulation_sessions', 'id', second.sessionId), 0);
    assert.equal(await countRows('conversation_messages', 'session_id', first.sessionId), 0);
    assert.equal(await countRows('conversation_messages', 'session_id', second.sessionId), 0);
    assert.equal(await countRows('evaluations', 'session_id', first.sessionId), 0);
    assert.equal(await countRows('rubric_scores', 'evaluation_id', first.evaluationId), 0);
    assert.equal(await countRows('supervision_events', 'session_id', second.sessionId), 0);
    assert.equal(await countRows('recording_metadata', 'session_id', second.sessionId), 0);

    assert.equal(await countRows('users', 'id', teacher.data.user.id), 1);
    assert.equal(await countRows('users', 'id', other.data.user.id), 1);
    assert.equal(await countRows('users', 'id', studentId), 1);
  } finally {
    await harness.stop();
    await teardown(harness);
  }
});
