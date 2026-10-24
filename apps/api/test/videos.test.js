import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { query } from '../src/db.js';
import { extractYouTubeVideoId } from '../src/youtube.js';
import { createTestTeacher } from '../test-support/helpers.js';

test('parser de URLs de YouTube', () => {
  assert.equal(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ?t=3'), 'dQw4w9WgXcQ');
  assert.equal(extractYouTubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractYouTubeVideoId('https://youtube.com/shorts/dQw4w9WgXcQ?feature=share'), 'dQw4w9WgXcQ');
  assert.equal(extractYouTubeVideoId('https://m.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractYouTubeVideoId('https://vimeo.com/123456789'), null);
  assert.equal(extractYouTubeVideoId('https://www.youtube.com/watch?v=short'), null);
  assert.equal(extractYouTubeVideoId('https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(extractYouTubeVideoId('https://youtube.com/playlist?list=abc'), null);
  assert.equal(extractYouTubeVideoId('no es una url'), null);
});

test('videos: permisos, visibilidad y CRUD', { skip: process.env.NODE_ENV !== 'test' }, async () => {
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
    const teacher = await register('teacher', 'Docente videos', 'teacher');
    const other = await register('teacher', 'Otra docente', 'other');
    const student = await register('student', 'Estudiante videos', 'student');

    const initialPublicList = await call('/videos');
    assert.equal(initialPublicList.status, 200);
    const initialPublicCount = initialPublicList.data.videos.length;

    const created = async (payload) => call('/videos', 'POST', payload, teacher.cookie);
    const watch = await created({ title: 'Video watch', description: 'Descripción del video', youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', published: true });
    assert.equal(watch.status, 201);
    assert.equal(watch.data.video.youtubeVideoId, 'dQw4w9WgXcQ');
    const short = await created({ title: 'Video corto', description: '', youtubeUrl: 'https://youtu.be/abcdefghijk', published: false });
    assert.equal(short.status, 201);
    assert.equal(short.data.video.youtubeVideoId, 'abcdefghijk');
    const shorts = await created({ title: 'Short', description: 'Formato vertical', youtubeUrl: 'https://youtube.com/shorts/zyxwvutsrqp?feature=share', published: true });
    assert.equal(shorts.status, 201);
    assert.equal(shorts.data.video.youtubeVideoId, 'zyxwvutsrqp');

    assert.equal((await call('/videos', 'POST', { title: 'Intruso', description: '', youtubeUrl: 'https://youtu.be/abcdefghijk', published: true }, student.cookie)).status, 403);
    assert.equal((await created({ title: 'Ajeno', description: '', youtubeUrl: 'https://vimeo.com/123456789', published: true })).status, 400);

    const publicList = await call('/videos');
    assert.equal(publicList.status, 200);
    assert.equal(publicList.data.videos.length, initialPublicCount + 2);
    assert.equal(publicList.data.videos.some((video) => video.id === watch.data.video.id), true);
    assert.equal(publicList.data.videos.some((video) => video.id === shorts.data.video.id), true);
    assert.equal(publicList.data.videos.some((video) => video.id === short.data.video.id), false);
    assert.equal(publicList.data.videos.every((video) => video.published === true), true);

    const studentList = await call('/videos', 'GET', null, student.cookie);
    assert.equal(studentList.data.videos.length, initialPublicCount + 2);

    const publicAsTeacher = await call('/videos?published=true', 'GET', null, teacher.cookie);
    assert.equal(publicAsTeacher.status, 200);
    assert.equal(publicAsTeacher.data.videos.length, initialPublicCount + 2);
    assert.equal(publicAsTeacher.data.videos.some((video) => video.id === watch.data.video.id), true);
    assert.equal(publicAsTeacher.data.videos.some((video) => video.id === shorts.data.video.id), true);
    assert.equal(publicAsTeacher.data.videos.every((video) => video.published === true), true);

    const teacherList = await call('/videos', 'GET', null, teacher.cookie);
    assert.equal(teacherList.data.videos.length, 3);
    assert.equal((await call('/videos', 'GET', null, other.cookie)).data.videos.length, 0);

    assert.equal((await call(`/videos/${watch.data.video.id}`)).status, 200);
    assert.equal((await call(`/videos/${short.data.video.id}`)).status, 404);

    const editShort = await call(`/videos/${short.data.video.id}`, 'PATCH', { title: 'Video editado', youtubeUrl: 'https://www.youtube.com/shorts/11111111111', published: true }, teacher.cookie);
    assert.equal(editShort.status, 200);
    assert.equal(editShort.data.video.title, 'Video editado');
    assert.equal(editShort.data.video.youtubeVideoId, '11111111111');
    assert.equal(editShort.data.video.published, true);
    assert.equal((await call(`/videos/${short.data.video.id}`)).status, 200);
    assert.equal((await call('/videos', 'GET', null, null)).data.videos.length, initialPublicCount + 3);

    assert.equal((await call(`/videos/${watch.data.video.id}`, 'PATCH', { title: 'Intrusión' }, other.cookie)).status, 404);
    assert.equal((await call(`/videos/${watch.data.video.id}`, 'PATCH', { youtubeUrl: 'https://example.com/video' }, teacher.cookie)).status, 400);
    const afterInvalid = await call(`/videos/${watch.data.video.id}`, 'GET', null, teacher.cookie);
    assert.equal(afterInvalid.data.video.youtubeUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.equal(afterInvalid.data.video.youtubeVideoId, 'dQw4w9WgXcQ');

    assert.equal((await call(`/videos/${shorts.data.video.id}`, 'DELETE', null, teacher.cookie)).status, 204);
    assert.equal((await call(`/videos/${shorts.data.video.id}`)).status, 404);
    assert.equal((await call(`/videos/${watch.data.video.id}`, 'DELETE', null, other.cookie)).status, 404);
    assert.equal((await call(`/videos/${watch.data.video.id}`)).status, 200);
    assert.equal((await call(`/videos/${short.data.video.id}`, 'DELETE', null, teacher.cookie)).status, 204);
    assert.equal((await call(`/videos/${short.data.video.id}`)).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (userIds.length) await query('DELETE FROM videos WHERE teacher_id = ANY($1::uuid[])', [userIds]);
    for (const id of userIds) await query('DELETE FROM users WHERE id = $1', [id]);
  }
});
