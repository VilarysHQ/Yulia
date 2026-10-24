import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { query } from '../src/db.js';
import { createTestTeacher } from '../test-support/helpers.js';

const PASSWORD = 'Password123!';

test('el registro público solo crea estudiantes y conserva el login docente', { skip: process.env.NODE_ENV !== 'test' }, async () => {
  const marker = randomUUID();
  const userIds = [];
  let server;
  let base;

  const call = async (path, method = 'GET', body, cookie) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Origin: env.ALLOWED_ORIGINS[0], ...(cookie ? { Cookie: cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = response.status === 204 ? null : await response.json().catch(() => null);
    return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  };

  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;

  try {
    const studentEmail = `student-${marker}@example.test`;
    const normal = await call('/auth/register', 'POST', {
      name: 'Estudiante pública',
      email: studentEmail,
      password: PASSWORD,
      role: 'student',
    });
    assert.equal(normal.status, 201);
    assert.equal(normal.data.user.role, 'student');
    userIds.push(normal.data.user.id);

    const withoutRoleEmail = `student-no-role-${marker}@example.test`;
    const withoutRole = await call('/auth/register', 'POST', {
      name: 'Estudiante sin rol explícito',
      email: withoutRoleEmail,
      password: PASSWORD,
    });
    assert.equal(withoutRole.status, 201);
    assert.equal(withoutRole.data.user.role, 'student');
    userIds.push(withoutRole.data.user.id);

    const teacherEmail = `teacher-attempt-${marker}@example.test`;
    const teacherAttempt = await call('/auth/register', 'POST', {
      name: 'Intento docente',
      email: teacherEmail,
      password: PASSWORD,
      role: 'teacher',
    });
    assert.equal(teacherAttempt.status, 400);
    assert.equal(teacherAttempt.cookie, undefined);
    assert.equal((await query('SELECT id FROM users WHERE email = $1', [teacherEmail])).rowCount, 0);

    const adminAttempt = await call('/auth/register', 'POST', {
      name: 'Intento admin',
      email: `admin-attempt-${marker}@example.test`,
      password: PASSWORD,
      role: 'admin',
    });
    assert.equal(adminAttempt.status, 400);

    const rows = await query(
      'SELECT email, role FROM users WHERE email = ANY($1::text[])',
      [[studentEmail, withoutRoleEmail]],
    );
    assert.equal(rows.rowCount, 2);
    assert.equal(rows.rows.every((row) => row.role === 'student'), true);
    assert.deepEqual(
      rows.rows.map((row) => row.email).sort(),
      [studentEmail, withoutRoleEmail].sort(),
    );

    const teacher = await createTestTeacher({
      name: 'Docente existente',
      email: `existing-teacher-${marker}@example.test`,
      password: PASSWORD,
    });
    userIds.push(teacher.id);

    const teacherLogin = await call('/auth/login', 'POST', { email: teacher.email, password: PASSWORD });
    assert.equal(teacherLogin.status, 200);
    assert.equal(teacherLogin.data.user.role, 'teacher');
    assert.ok(teacherLogin.cookie);

    const session = await call('/auth/me', 'GET', null, teacherLogin.cookie);
    assert.equal(session.status, 200);
    assert.equal(session.data.user.role, 'teacher');
    assert.equal(session.data.user.email, teacher.email);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const id of userIds) await query('DELETE FROM users WHERE id = $1', [id]);
  }
});
