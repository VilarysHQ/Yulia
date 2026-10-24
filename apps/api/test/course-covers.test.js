import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { query } from '../src/db.js';
import { MAX_COVER_BYTES } from '../src/storage.js';
import { createTestTeacher } from '../test-support/helpers.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlOQAAAAASUVORK5CYII=', 'base64');
const WEBP = Buffer.from('RIFF0000WEBPVP8 ', 'ascii');
const GIF = Buffer.from('GIF89a', 'ascii');

function fakeStorage() {
  const objects = new Map();
  const removed = [];
  return {
    available: true,
    objects,
    removed,
    failRemove: false,
    publicUrl(path) {
      return `https://storage.test/public/course-covers/${path}`;
    },
    async createSignedUpload(path) {
      const extension = path.split('.').pop();
      const contentType = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}`;
      objects.set(path, { contentType, bytes: null });
      return { url: `https://storage.test/upload/${encodeURIComponent(path)}`, expiresIn: 7200 };
    },
    upload(path, { contentType, bytes = PNG } = {}) {
      const current = objects.get(path) ?? {};
      objects.set(path, { contentType: contentType ?? current.contentType, bytes: Buffer.from(bytes) });
    },
    async stat(path) {
      const object = objects.get(path);
      if (!object?.bytes) {
        const error = new Error('No encontrado');
        error.status = 404;
        throw error;
      }
      return { size: object.bytes.length, contentType: object.contentType };
    },
    async readHead(path) {
      return objects.get(path).bytes.subarray(0, 16);
    },
    async remove(path) {
      removed.push(path);
      if (this.failRemove) throw new Error('Fallo simulado de Storage');
      objects.delete(path);
    },
  };
}

test('portadas de curso: permisos, validación, publicación y limpieza', { skip: process.env.NODE_ENV !== 'test' }, async () => {
  const marker = randomUUID();
  const storage = fakeStorage();
  const userIds = [];
  const courseIds = [];
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

  server = createApp({ storage }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api`;

  try {
    const password = 'Password123!';
    const register = async (role, name, slug) => {
      const email = `${slug}-${marker}@example.test`;
      if (role === 'teacher') {
        const user = await createTestTeacher({ name, email, password });
        userIds.push(user.id);
        const login = await call('/auth/login', 'POST', { email, password });
        assert.equal(login.status, 200);
        return login;
      }
      const response = await call('/auth/register', 'POST', { name, email, password, role });
      assert.equal(response.status, 201);
      userIds.push(response.data.user.id);
      return response;
    };
    const teacher = await register('teacher', 'Docente portadas', 'teacher');
    const other = await register('teacher', 'Otra docente', 'other');
    const student = await register('student', 'Estudiante portadas', 'student');

    const createDraft = async (title) => {
      const response = await call('/courses', 'POST', { title, description: 'Descripción del curso', published: false }, teacher.cookie);
      assert.equal(response.status, 201);
      assert.equal(response.data.course.published, false);
      assert.equal(response.data.course.coverImagePath, null);
      assert.equal(response.data.course.coverImageUrl, null);
      courseIds.push(response.data.course.id);
      return response.data.course.id;
    };
    const sign = async (courseId) => {
      const response = await call(`/courses/${courseId}/cover/upload-url`, 'POST', { contentType: 'image/png', size: PNG.length }, teacher.cookie);
      assert.equal(response.status, 200);
      assert.equal(response.data.upload.method, 'PUT');
      assert.equal(response.data.upload.headers['Content-Type'], 'image/png');
      assert.equal(response.data.upload.headers['x-upsert'], 'false');
      assert.match(response.data.upload.path, new RegExp(`^courses/${courseId}/[0-9a-f-]{36}\\.png$`, 'i'));
      return response.data.upload.path;
    };
    const attachCover = async (courseId) => {
      const path = await sign(courseId);
      storage.upload(path);
      const confirmed = await call(`/courses/${courseId}/cover/confirm`, 'POST', { path }, teacher.cookie);
      assert.equal(confirmed.status, 200);
      return { path, course: confirmed.data.course };
    };

    const draft = await createDraft('Curso con portada');
    assert.equal((await call(`/courses/${draft}/cover/upload-url`, 'POST', { contentType: 'image/png', size: PNG.length })).status, 401);
    assert.equal((await call(`/courses/${draft}/cover/upload-url`, 'POST', { contentType: 'image/png', size: PNG.length }, student.cookie)).status, 403);
    assert.equal((await call(`/courses/${draft}/cover/upload-url`, 'POST', { contentType: 'image/png', size: PNG.length }, other.cookie)).status, 404);
    assert.equal((await call(`/courses/${draft}/cover/confirm`, 'POST', { path: `courses/${draft}/${randomUUID()}.png` }, other.cookie)).status, 404);
    assert.equal((await call(`/courses/${draft}/cover/confirm`, 'POST', { path: `courses/${draft}/${randomUUID()}.png` }, student.cookie)).status, 403);
    assert.equal((await call(`/courses/${draft}`, 'PATCH', { coverImagePath: `courses/${draft}/${randomUUID()}.png` }, teacher.cookie)).status, 400);
    assert.equal((await call(`/courses/${draft}/cover/upload-url`, 'POST', { contentType: 'image/gif', size: PNG.length }, teacher.cookie)).status, 400);
    assert.equal((await call(`/courses/${draft}/cover/upload-url`, 'POST', { contentType: 'image/png', size: MAX_COVER_BYTES + 1 }, teacher.cookie)).status, 400);
    assert.equal((await call(`/courses/${draft}`, 'PATCH', { published: true }, teacher.cookie)).status, 400);

    const missingPath = await sign(draft);
    assert.equal((await call(`/courses/${draft}/cover/confirm`, 'POST', { path: missingPath }, teacher.cookie)).status, 400);

    const firstPath = await sign(draft);
    storage.upload(firstPath, { contentType: 'image/webp', bytes: WEBP });
    assert.equal((await call(`/courses/${draft}/cover/confirm`, 'POST', { path: firstPath }, teacher.cookie)).status, 400);
    storage.upload(firstPath, { contentType: 'image/png', bytes: GIF });
    assert.equal((await call(`/courses/${draft}/cover/confirm`, 'POST', { path: firstPath }, teacher.cookie)).status, 400);
    storage.upload(firstPath);
    const confirmed = await call(`/courses/${draft}/cover/confirm`, 'POST', { path: firstPath }, teacher.cookie);
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.data.course.coverImagePath, firstPath);
    assert.equal(confirmed.data.course.coverImageUrl, storage.publicUrl(firstPath));
    assert.equal((await call(`/courses/${draft}/cover/confirm`, 'POST', { path: `courses/${draft}/../${randomUUID()}.png` }, teacher.cookie)).status, 400);

    const published = await call(`/courses/${draft}`, 'PATCH', { published: true }, teacher.cookie);
    assert.equal(published.status, 200);
    assert.equal(published.data.course.published, true);

    const publicList = await call('/courses');
    const publicCourse = publicList.data.courses.find((course) => course.id === draft);
    assert.equal(publicCourse.coverImagePath, firstPath);
    assert.equal(publicCourse.coverImageUrl, storage.publicUrl(firstPath));

    const detail = await call(`/courses/${draft}`, 'GET', null, student.cookie);
    assert.equal(detail.status, 200);
    assert.equal(detail.data.course.coverImageUrl, storage.publicUrl(firstPath));

    const edited = await call(`/courses/${draft}`, 'PATCH', { title: 'Curso editado' }, teacher.cookie);
    assert.equal(edited.status, 200);
    assert.equal(edited.data.course.coverImagePath, firstPath);
    assert.deepEqual(storage.removed, []);

    const secondPath = await sign(draft);
    storage.upload(secondPath);
    const replaced = await call(`/courses/${draft}/cover/confirm`, 'POST', { path: secondPath }, teacher.cookie);
    assert.equal(replaced.status, 200);
    assert.equal(replaced.data.course.coverImagePath, secondPath);
    assert.deepEqual(storage.removed, [firstPath]);
    assert.equal(storage.objects.has(secondPath), true);

    storage.failRemove = true;
    const thirdPath = await sign(draft);
    storage.upload(thirdPath);
    const replacedWithFailure = await call(`/courses/${draft}/cover/confirm`, 'POST', { path: thirdPath }, teacher.cookie);
    assert.equal(replacedWithFailure.status, 200);
    assert.equal(replacedWithFailure.data.course.coverImagePath, thirdPath);
    assert.deepEqual(storage.removed, [firstPath, secondPath]);
    storage.failRemove = false;

    const oversizedPath = await sign(draft);
    storage.upload(oversizedPath, { bytes: Buffer.concat([PNG, Buffer.alloc(MAX_COVER_BYTES)]) });
    assert.equal((await call(`/courses/${draft}/cover/confirm`, 'POST', { path: oversizedPath }, teacher.cookie)).status, 400);

    const legacy = await createDraft('Curso anterior sin portada');
    await query('UPDATE courses SET published = true WHERE id = $1', [legacy]);
    const legacyDetail = await call(`/courses/${legacy}`, 'GET', null, student.cookie);
    assert.equal(legacyDetail.status, 200);
    assert.equal(legacyDetail.data.course.coverImagePath, null);
    assert.equal(legacyDetail.data.course.coverImageUrl, null);
    assert.equal((await call(`/courses/${legacy}`, 'PATCH', { title: 'Curso anterior editado' }, teacher.cookie)).status, 200);
    assert.equal((await call(`/courses/${legacy}`, 'PATCH', { published: true }, teacher.cookie)).status, 200);
    assert.equal((await call(`/courses/${legacy}`, 'PATCH', { published: false }, teacher.cookie)).status, 200);
    assert.equal((await call(`/courses/${legacy}`, 'PATCH', { published: true }, teacher.cookie)).status, 400);

    const keep = await createDraft('Curso que se conserva');
    const kept = await attachCover(keep);
    storage.removed.length = 0;
    assert.equal((await call(`/courses/${keep}`, 'DELETE', null, other.cookie)).status, 404);
    assert.deepEqual(storage.removed, []);
    assert.equal((await call(`/courses/${draft}`, 'DELETE', null, teacher.cookie)).status, 204);
    assert.deepEqual(storage.removed, [thirdPath]);
    assert.equal(storage.objects.has(thirdPath), false);
    assert.equal(storage.objects.has(kept.path), true);
    assert.equal((await query('SELECT id FROM courses WHERE id = $1', [draft])).rowCount, 0);
    assert.equal((await query('SELECT id FROM courses WHERE id = $1', [keep])).rowCount, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const id of courseIds) {
      await query('DELETE FROM enrollments WHERE course_id = $1', [id]).catch(() => {});
      await query('DELETE FROM clinical_cases WHERE course_id = $1', [id]).catch(() => {});
      await query('DELETE FROM courses WHERE id = $1', [id]).catch(() => {});
    }
    for (const id of userIds) await query('DELETE FROM users WHERE id = $1', [id]).catch(() => {});
  }
});
