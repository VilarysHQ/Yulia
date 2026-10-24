import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { query } from '../src/db.js';
import { createTestTeacher } from '../test-support/helpers.js';

test('seguimiento docente: métricas, filtros, historial y aislamiento', { skip: process.env.NODE_ENV !== 'test' }, async () => {
  const marker = randomUUID();
  const ids = { users: [], courses: [], simulations: [], sessions: [] };
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (path, cookie) => {
    const response = await fetch(`${base}${path}`, { headers: cookie ? { Cookie: cookie } : {} });
    return { status: response.status, data: await response.json() };
  };
  const auth = async (email) => {
    const response = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: env.ALLOWED_ORIGINS[0] },
      body: JSON.stringify({ email, password: 'Password123!' }),
    });
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie').split(';')[0];
  };

  try {
    const teacher = await createTestTeacher({ name: 'Docente Seguimiento', email: `teacher-${marker}@example.test` });
    const other = await createTestTeacher({ name: 'Otra Docente', email: `other-${marker}@example.test` });
    ids.users.push(teacher.id, other.id);
    const studentIds = [];
    for (const name of ['Ana Estudiante', 'Bea Estudiante']) {
      const email = `${name.startsWith('Ana') ? 'ana' : 'bea'}-${marker}@example.test`;
      const { rows } = await query(`INSERT INTO users (display_name, email, password_hash, role)
        VALUES ($1, $2, 'test-hash', 'student') RETURNING id`, [name, email]);
      studentIds.push(rows[0].id); ids.users.push(rows[0].id);
    }
    const [ana, bea] = studentIds;
    const ownCookie = await auth(teacher.email);
    const otherCookie = await auth(other.email);
    const studentCookie = await authWithStudent(base, ana, marker);

    for (const [owner, title] of [[teacher.id, 'Curso propio'], [other.id, 'Curso ajeno']]) {
      const { rows } = await query(`INSERT INTO courses (title, description, teacher_id, published)
        VALUES ($1, '', $2, true) RETURNING id`, [title, owner]);
      ids.courses.push(rows[0].id);
    }
    const [ownCourse, otherCourse] = ids.courses;
    for (const [courseId, title] of [[ownCourse, 'Caso uno'], [ownCourse, 'Caso dos'], [otherCourse, 'Caso ajeno']]) {
      const { rows } = await query(`INSERT INTO clinical_cases (slug, title, subject, difficulty, topic,
        clinical_situation, academic_challenge, tutor_instructions, rubric_definition, course_id, published)
        VALUES ($1, $2, 'Bioquímica', 'introductorio', $2, 'Escenario de prueba.',
          'Razonar el caso', 'Guiar', '{}'::jsonb, $3, true) RETURNING id`, [randomUUID(), title, courseId]);
      ids.simulations.push(rows[0].id);
    }
    const [first, second, foreign] = ids.simulations;
    for (const [studentId, courseId] of [[ana, ownCourse], [bea, ownCourse], [ana, otherCourse]]) {
      await query('INSERT INTO enrollments (student_id, course_id) VALUES ($1, $2)', [studentId, courseId]);
    }
    for (const [caseId, status] of [[first, 'active'], [second, 'completed'], [foreign, 'completed']]) {
      const { rows } = await query(`INSERT INTO simulation_sessions
        (student_id, clinical_case_id, case_version, status, started_at, completed_at, last_activity_at)
        VALUES ($1, $2, 1, $3::session_status, now() - interval '1 day',
          CASE WHEN $3 = 'completed' THEN now() ELSE NULL END, now()) RETURNING id`, [ana, caseId, status]);
      ids.sessions.push(rows[0].id);
    }
    const [emptySession, completedSession, foreignSession] = ids.sessions;
    await query(`INSERT INTO conversation_messages (session_id, role, stage, content, sequence_number)
      VALUES ($1, 'student', 'inicio', 'Mensaje estudiante', 1),
             ($1, 'tutor', 'inicio', 'Respuesta Yulia', 2)`, [completedSession]);

    const overview = await call('/teacher/overview', ownCookie);
    assert.equal(overview.status, 200);
    assert.deepEqual(Object.fromEntries(Object.entries(overview.data.overview).filter(([key]) => !['participation', 'topSimulations', 'recentConversations'].includes(key))), {
      students: 2, enrollments: 2, publishedSimulations: 2,
      startedSessions: 2, activeSessions: 1, completedSessions: 1,
    });
    assert.deepEqual(overview.data.overview.participation, { notStarted: 2, active: 1, completed: 1 });
    assert.deepEqual(overview.data.overview.topSimulations.map(({ title, startedSessions }) => ({ title, startedSessions })), [
      { title: 'Caso dos', startedSessions: 1 }, { title: 'Caso uno', startedSessions: 1 },
    ]);
    assert.equal(overview.data.overview.recentConversations.length, 1);
    assert.equal(overview.data.overview.recentConversations[0].id, completedSession);
    const students = await call('/teacher/students?search=Ana&limit=1&page=1', ownCookie);
    assert.equal(students.data.total, 1);
    assert.equal(students.data.students[0].id, ana);
    assert.equal(students.data.students[0].startedSimulations, 2);
    assert.equal(students.data.students[0].completedSimulations, 1);
    assert.equal(students.data.students[0].courses.length, 1);
    assert.ok(students.data.students[0].lastActivity);
    assert.equal((await call('/teacher/students?limit=1&page=2', ownCookie)).data.students[0].id, bea);

    const sessions = await call('/teacher/sessions', ownCookie);
    assert.equal(sessions.data.total, 4);
    assert.equal(sessions.data.sessions.some((item) => item.id === foreignSession), false);
    const sessionPageOne = await call('/teacher/sessions?limit=1&page=1', ownCookie);
    const sessionPageTwo = await call('/teacher/sessions?limit=1&page=2', ownCookie);
    assert.equal(sessionPageOne.data.total, 4);
    assert.notDeepEqual(sessionPageOne.data.sessions[0], sessionPageTwo.data.sessions[0]);
    const missing = await call('/teacher/sessions?status=not_started&studentId=' + bea, ownCookie);
    assert.equal(missing.data.total, 2);
    assert.ok(missing.data.sessions.every((item) => item.id === null && item.startedAt === null));
    const active = await call(`/teacher/sessions?courseId=${ownCourse}&simulationId=${first}&status=active&search=Ana`, ownCookie);
    assert.equal(active.data.total, 1);
    assert.equal(active.data.sessions[0].id, emptySession);
    assert.ok(active.data.sessions[0].startedAt);
    const completed = await call(`/teacher/sessions?status=completed&limit=1&page=1`, ownCookie);
    assert.equal(completed.data.total, 1);
    assert.ok(completed.data.sessions[0].completedAt);

    const firstPage = await call(`/teacher/sessions/${completedSession}/messages?limit=1`, ownCookie);
    assert.equal(firstPage.status, 200);
    assert.equal(firstPage.data.messages[0].sequenceNumber, 1);
    assert.equal(firstPage.data.nextAfter, 1);
    const secondPage = await call(`/teacher/sessions/${completedSession}/messages?limit=1&after=1`, ownCookie);
    assert.equal(secondPage.data.messages[0].sequenceNumber, 2);
    assert.equal(secondPage.data.nextAfter, null);
    assert.equal((await call(`/teacher/sessions/${emptySession}/messages`, ownCookie)).data.messages.length, 0);
    assert.equal((await call(`/teacher/sessions/${foreignSession}/messages`, ownCookie)).status, 404);
    assert.equal((await call(`/teacher/sessions/${completedSession}/messages`, otherCookie)).status, 404);
    assert.equal((await call('/teacher/overview', studentCookie)).status, 403);
    assert.equal((await call('/teacher/students', studentCookie)).status, 403);
    assert.equal((await call('/teacher/sessions', studentCookie)).status, 403);
    assert.equal((await call(`/teacher/sessions/${completedSession}/messages`, studentCookie)).status, 403);
    assert.equal((await call('/teacher/students', otherCookie)).data.total, 1);
    assert.equal((await call('/teacher/sessions', otherCookie)).data.total, 1);
    assert.equal((await call('/teacher/students')).status, 401);
    assert.equal((await call('/teacher/sessions?status=invalid', ownCookie)).status, 400);
  } finally {
    for (const id of ids.sessions) await query('DELETE FROM simulation_sessions WHERE id = $1', [id]);
    for (const id of ids.simulations) await query('DELETE FROM clinical_cases WHERE id = $1', [id]);
    for (const id of ids.courses) {
      await query('DELETE FROM enrollments WHERE course_id = $1', [id]);
      await query('DELETE FROM courses WHERE id = $1', [id]);
    }
    for (const id of ids.users) await query('DELETE FROM users WHERE id = $1', [id]);
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

async function authWithStudent(base, studentId, marker) {
  const passwordHash = await (await import('../src/auth.js')).hashPassword('Password123!');
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, studentId]);
  const response = await fetch(`${base}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: env.ALLOWED_ORIGINS[0] },
    body: JSON.stringify({ email: `ana-${marker}@example.test`, password: 'Password123!' }),
  });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}
