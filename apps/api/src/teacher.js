import { Router } from 'express';
import { z } from 'zod';
import { requireRole, requireUser } from './auth.js';
import { query } from './db.js';

const uuid = z.string().uuid();
const pageInput = z.coerce.number().int().min(1).max(100000).default(1);
const limitInput = z.coerce.number().int().min(1).max(100).default(20);
const studentFilters = z.object({
  search: z.string().trim().max(120).optional(),
  page: pageInput,
  limit: limitInput,
}).strict();
const sessionFilters = studentFilters.extend({
  courseId: uuid.optional(),
  simulationId: uuid.optional(),
  studentId: uuid.optional(),
  status: z.enum(['not_started', 'created', 'active', 'interrupted', 'completed', 'cancelled']).optional(),
});
const messageFilters = z.object({
  after: z.coerce.number().int().min(0).max(2147483647).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict();
const wrap = (handler) => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);

function parse(schema, input, res) {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  res.status(400).json({ error: 'Filtros inválidos' });
  return null;
}

export const studentScope = `
  FROM users u
  JOIN enrollments e ON e.student_id = u.id
  JOIN courses c ON c.id = e.course_id
  WHERE c.teacher_id = $1
    AND ($2::text IS NULL OR position(lower($2) in lower(u.display_name)) > 0
      OR position(lower($2) in lower(u.email)) > 0)`;

export const sessionScope = `WITH activity AS (
  SELECT ss.id AS session_id, ss.student_id, u.display_name AS student_name,
    u.email AS student_email, c.id AS course_id, c.title AS course_title,
    s.id AS simulation_id, s.title AS simulation_title, ss.status::text AS status,
    ss.started_at, ss.completed_at, ss.last_activity_at
  FROM simulation_sessions ss
  JOIN users u ON u.id = ss.student_id
  JOIN clinical_cases s ON s.id = ss.clinical_case_id
  JOIN courses c ON c.id = s.course_id
  WHERE c.teacher_id = $1
  UNION ALL
  SELECT NULL::uuid, e.student_id, u.display_name, u.email, c.id, c.title,
    s.id, s.title, 'not_started', NULL::timestamptz, NULL::timestamptz, NULL::timestamptz
  FROM enrollments e
  JOIN users u ON u.id = e.student_id
  JOIN courses c ON c.id = e.course_id
  JOIN clinical_cases s ON s.course_id = c.id AND s.published = true
  WHERE c.teacher_id = $1 AND c.published = true
    AND NOT EXISTS (SELECT 1 FROM simulation_sessions ss
      WHERE ss.student_id = e.student_id AND ss.clinical_case_id = s.id)
)
SELECT * FROM activity
WHERE ($2::uuid IS NULL OR course_id = $2)
  AND ($3::uuid IS NULL OR simulation_id = $3)
  AND ($4::uuid IS NULL OR student_id = $4)
  AND ($5::text IS NULL OR status = $5)
  AND ($6::text IS NULL OR position(lower($6) in lower(student_name)) > 0
    OR position(lower($6) in lower(student_email)) > 0)`;

export function createTeacherRouter() {
  const teacher = Router();
  teacher.use(requireUser, requireRole('teacher'));

  teacher.get('/overview', wrap(async (req, res) => {
    const { rows } = await query(`SELECT
      (SELECT count(DISTINCT e.student_id)::int FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE c.teacher_id = $1) AS "students",
      (SELECT count(*)::int FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE c.teacher_id = $1) AS "enrollments",
      (SELECT count(*)::int FROM clinical_cases s JOIN courses c ON c.id = s.course_id WHERE c.teacher_id = $1 AND s.published = true) AS "publishedSimulations",
      (SELECT count(*)::int FROM simulation_sessions ss JOIN clinical_cases s ON s.id = ss.clinical_case_id JOIN courses c ON c.id = s.course_id WHERE c.teacher_id = $1 AND ss.started_at IS NOT NULL) AS "startedSessions",
      (SELECT count(*)::int FROM simulation_sessions ss JOIN clinical_cases s ON s.id = ss.clinical_case_id JOIN courses c ON c.id = s.course_id WHERE c.teacher_id = $1 AND ss.status = 'active') AS "activeSessions",
      (SELECT count(*)::int FROM simulation_sessions ss JOIN clinical_cases s ON s.id = ss.clinical_case_id JOIN courses c ON c.id = s.course_id WHERE c.teacher_id = $1 AND ss.status = 'completed') AS "completedSessions"`, [req.user.id]);
    // These aggregates cover all of this teacher's data, not just the current activity page.
    const [notStarted, topSimulations, recentConversations] = await Promise.all([
      query(`SELECT count(*)::int AS total FROM enrollments e
        JOIN courses c ON c.id = e.course_id
        JOIN clinical_cases s ON s.course_id = c.id AND s.published = true
        WHERE c.teacher_id = $1 AND c.published = true
          AND NOT EXISTS (SELECT 1 FROM simulation_sessions ss
            WHERE ss.student_id = e.student_id AND ss.clinical_case_id = s.id)`, [req.user.id]),
      query(`SELECT s.id, s.title, count(ss.id)::int AS "startedSessions"
        FROM simulation_sessions ss
        JOIN clinical_cases s ON s.id = ss.clinical_case_id
        JOIN courses c ON c.id = s.course_id
        WHERE c.teacher_id = $1 AND ss.started_at IS NOT NULL
        GROUP BY s.id, s.title ORDER BY count(ss.id) DESC, s.title, s.id LIMIT 3`, [req.user.id]),
      query(`SELECT ss.id, u.display_name AS "studentName", s.title AS "simulationTitle",
          ss.status::text AS status,
          greatest(coalesce(ss.last_activity_at, ss.created_at), latest.message_at) AS "lastActivityAt"
        FROM simulation_sessions ss
        JOIN users u ON u.id = ss.student_id
        JOIN clinical_cases s ON s.id = ss.clinical_case_id
        JOIN courses c ON c.id = s.course_id
        JOIN LATERAL (SELECT max(m.created_at) AS message_at FROM conversation_messages m
          WHERE m.session_id = ss.id AND m.role IN ('student', 'tutor')) latest ON latest.message_at IS NOT NULL
        WHERE c.teacher_id = $1
        ORDER BY "lastActivityAt" DESC, ss.id DESC LIMIT 4`, [req.user.id]),
    ]);
    res.json({ overview: {
      ...rows[0],
      participation: { notStarted: notStarted.rows[0].total, active: rows[0].activeSessions,
        completed: rows[0].completedSessions },
      topSimulations: topSimulations.rows,
      recentConversations: recentConversations.rows,
    } });
  }));

  teacher.get('/students', wrap(async (req, res) => {
    const filters = parse(studentFilters, req.query, res); if (!filters) return;
    const { page, limit, search } = filters;
    const scopeValues = [req.user.id, search || null];
    const count = await query(`SELECT count(DISTINCT u.id)::int AS total ${studentScope}`, scopeValues);
    const { rows } = await query(`WITH selected AS (
      SELECT DISTINCT u.id, u.display_name, u.email ${studentScope}
      ORDER BY u.display_name, u.id LIMIT $3 OFFSET $4
    )
    SELECT p.id, p.display_name AS name, p.email,
      COALESCE((SELECT json_agg(json_build_object('id', c.id, 'title', c.title) ORDER BY c.title, c.id)
        FROM enrollments e JOIN courses c ON c.id = e.course_id
        WHERE e.student_id = p.id AND c.teacher_id = $1), '[]'::json) AS courses,
      (SELECT count(DISTINCT ss.clinical_case_id)::int FROM simulation_sessions ss
        JOIN clinical_cases s ON s.id = ss.clinical_case_id JOIN courses c ON c.id = s.course_id
        WHERE ss.student_id = p.id AND c.teacher_id = $1 AND ss.started_at IS NOT NULL) AS "startedSimulations",
      (SELECT count(DISTINCT ss.clinical_case_id)::int FROM simulation_sessions ss
        JOIN clinical_cases s ON s.id = ss.clinical_case_id JOIN courses c ON c.id = s.course_id
        WHERE ss.student_id = p.id AND c.teacher_id = $1 AND ss.status = 'completed') AS "completedSimulations",
      (SELECT max(coalesce(ss.last_activity_at, ss.completed_at, ss.started_at, ss.created_at))
        FROM simulation_sessions ss JOIN clinical_cases s ON s.id = ss.clinical_case_id
        JOIN courses c ON c.id = s.course_id
        WHERE ss.student_id = p.id AND c.teacher_id = $1) AS "lastActivity"
    FROM selected p ORDER BY p.display_name, p.id`, [...scopeValues, limit, (page - 1) * limit]);
    res.json({ students: rows, page, limit, total: count.rows[0].total });
  }));

  teacher.get('/sessions', wrap(async (req, res) => {
    const filters = parse(sessionFilters, req.query, res); if (!filters) return;
    const { page, limit, courseId, simulationId, studentId, status, search } = filters;
    const values = [req.user.id, courseId ?? null, simulationId ?? null, studentId ?? null, status ?? null, search || null];
    const count = await query(`SELECT count(*)::int AS total FROM (${sessionScope}) filtered`, values);
    const { rows } = await query(`${sessionScope}
      ORDER BY started_at DESC NULLS LAST, course_id, simulation_id, student_id, session_id NULLS LAST
      LIMIT $7 OFFSET $8`, [...values, limit, (page - 1) * limit]);
    res.json({ sessions: rows.map((row) => ({
      id: row.session_id, studentId: row.student_id, studentName: row.student_name,
      studentEmail: row.student_email, courseId: row.course_id, courseTitle: row.course_title,
      simulationId: row.simulation_id, simulationTitle: row.simulation_title, status: row.status,
      startedAt: row.started_at, completedAt: row.completed_at, lastActivityAt: row.last_activity_at,
    })), page, limit, total: count.rows[0].total });
  }));

  teacher.get('/sessions/:sessionId/messages', wrap(async (req, res) => {
    const id = parse(uuid, req.params.sessionId, res); if (!id) return;
    const filters = parse(messageFilters, req.query, res); if (!filters) return;
    const { rows } = await query(`SELECT ss.id, ss.status::text AS status,
      ss.started_at AS "startedAt", ss.completed_at AS "completedAt",
      u.id AS "studentId", u.display_name AS "studentName",
      c.id AS "courseId", c.title AS "courseTitle",
      s.id AS "simulationId", s.title AS "simulationTitle"
      FROM simulation_sessions ss
      JOIN users u ON u.id = ss.student_id
      JOIN clinical_cases s ON s.id = ss.clinical_case_id
      JOIN courses c ON c.id = s.course_id
      WHERE ss.id = $1 AND c.teacher_id = $2`, [id, req.user.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Sesión no encontrada' });
    const { rows: messages } = await query(`SELECT id, role, content,
      sequence_number AS "sequenceNumber", created_at AS "createdAt"
      FROM conversation_messages WHERE session_id = $1 AND sequence_number > $2
        AND role IN ('student', 'tutor')
      ORDER BY sequence_number ASC LIMIT $3`, [id, filters.after, filters.limit + 1]);
    const hasMore = messages.length > filters.limit;
    const page = messages.slice(0, filters.limit);
    res.json({ session: rows[0], messages: page,
      nextAfter: hasMore ? page.at(-1).sequenceNumber : null });
  }));

  teacher.use((_req, res) => res.status(404).json({ error: 'Recurso no encontrado' }));
  return teacher;
}
