import { useEffect, useRef, useState } from 'react';
import { Activity, BarChart3, BookOpen, CheckCircle2, CirclePlay, MessageSquareText, RotateCcw, Search, Users } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Message } from '../components/ui/Message';
import { Modal } from '../components/ui/Modal';
import { StatusBadge } from '../components/ui/StatusBadge';
import { api } from './api';

const dateFormatter = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
const shortDateFormatter = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });
const timeFormatter = new Intl.DateTimeFormat('es-PE', { hour: 'numeric', minute: '2-digit' });
const PAGE_SIZE = 10;
const STATUS = {
  not_started: { label: 'Sin iniciar', tone: 'neutral' },
  active: { label: 'En curso', tone: 'info' },
  completed: { label: 'Finalizada', tone: 'success' },
  created: { label: 'Creada', tone: 'neutral' },
  interrupted: { label: 'Interrumpida', tone: 'warning' },
  cancelled: { label: 'Cancelada', tone: 'neutral' },
};

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
}

function Status({ value }) {
  const status = STATUS[value] ?? { label: value, tone: 'neutral' };
  return <StatusBadge variant={status.tone} dot>{status.label}</StatusBadge>;
}

function DateCell({ value }) {
  if (!value) return <span className="text-slate-400">—</span>;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <span className="text-slate-400">—</span>;
  return <time dateTime={value} className="block whitespace-nowrap leading-4 text-slate-600">
    <span className="block">{shortDateFormatter.format(date)}</span>
    <span className="block text-[11px] text-slate-500">{timeFormatter.format(date)}</span>
  </time>;
}

function Pager({ page, total, onChange }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-600">
      <span>{total} resultados · Página {page} de {pages}</span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>Anterior</Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>Siguiente</Button>
      </div>
    </div>
  );
}

function ConversationModal({ sessionId, onClose }) {
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [nextAfter, setNextAfter] = useState(null);
  const [loading, setLoading] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!sessionId) return undefined;
    let active = true;
    setSession(null); setMessages([]); setNextAfter(null); setError(''); setLoading(true);
    api(`/teacher/sessions/${sessionId}/messages?limit=50`)
      .then((data) => {
        if (!active) return;
        setSession(data.session); setMessages(data.messages); setNextAfter(data.nextAfter);
      })
      .catch((cause) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sessionId, attempt]);

  async function loadMore() {
    if (nextAfter === null || moreBusy) return;
    setMoreBusy(true); setError('');
    try {
      const data = await api(`/teacher/sessions/${sessionId}/messages?limit=50&after=${nextAfter}`);
      setMessages((current) => [...current, ...data.messages]);
      setNextAfter(data.nextAfter);
    } catch (cause) { setError(cause.message); }
    finally { setMoreBusy(false); }
  }

  return (
    <Modal open={Boolean(sessionId)} onClose={onClose} title="Conversación de la simulación"
      description="Historial de solo lectura del estudiante." size="xl">
      {loading ? <p role="status" className="py-8 text-center text-slate-600">Cargando conversación…</p> : null}
      {error ? <div className="space-y-3"><Message>{error}</Message>
        {!session ? <Button variant="secondary" size="sm" onClick={() => setAttempt((value) => value + 1)}>Reintentar</Button> : null}
      </div> : null}
      {session ? <>
        <div className="grid gap-x-6 gap-y-3 rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
          <p><strong className="text-navy">Estudiante:</strong> {session.studentName}</p>
          <p><strong className="text-navy">Curso:</strong> {session.courseTitle}</p>
          <p><strong className="text-navy">Simulación:</strong> {session.simulationTitle}</p>
          <p><strong className="text-navy">Estado:</strong> <Status value={session.status} /></p>
          <p><strong className="text-navy">Inicio:</strong> {formatDate(session.startedAt)}</p>
          <p><strong className="text-navy">Finalización:</strong> {formatDate(session.completedAt)}</p>
        </div>
        <div className="mt-5 max-h-[45vh] min-h-36 space-y-4 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/40 p-3 sm:p-5" aria-label="Historial de conversación">
          {messages.length === 0 ? <p className="py-8 text-center text-sm text-slate-600">Esta sesión no tiene mensajes.</p> : null}
          {messages.map((message) => <article key={message.id}
            className={`max-w-[92%] rounded-2xl border px-4 py-3 text-sm leading-6 shadow-sm sm:max-w-[78%] ${message.role === 'student' ? 'ml-auto border-blue-100 bg-blue-50 text-navy' : 'mr-auto border-emerald-100 bg-emerald-50 text-slate-800'}`}>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
              <span>{message.role === 'student' ? session.studentName : message.role === 'tutor' ? 'Yulia' : 'Sistema'}</span>
              <time className="font-normal text-slate-500" dateTime={message.createdAt}>{formatDate(message.createdAt)}</time>
            </div>
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          </article>)}
          {nextAfter !== null ? <div className="text-center">
            <Button variant="secondary" size="sm" disabled={moreBusy} onClick={loadMore}>
              {moreBusy ? 'Cargando…' : 'Cargar más mensajes'}
            </Button>
          </div> : messages.length > 0 ? <p className="pt-2 text-center text-xs text-slate-500">Historial completo</p> : null}
        </div>
      </> : null}
    </Modal>
  );
}

export function TeacherTrackingPage() {
  const sessionsRef = useRef(null);
  const [reload, setReload] = useState(0);
  const [overview, setOverview] = useState(null);
  const [courses, setCourses] = useState([]);
  const [simulations, setSimulations] = useState([]);
  const [topError, setTopError] = useState('');
  const [students, setStudents] = useState({ students: [], total: 0 });
  const [studentPage, setStudentPage] = useState(1);
  const [studentInput, setStudentInput] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [studentLoading, setStudentLoading] = useState(true);
  const [studentError, setStudentError] = useState('');
  const [sessions, setSessions] = useState({ sessions: [], total: 0 });
  const [sessionPage, setSessionPage] = useState(1);
  const [sessionInput, setSessionInput] = useState('');
  const [sessionSearch, setSessionSearch] = useState('');
  const [courseId, setCourseId] = useState('');
  const [simulationId, setSimulationId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [status, setStatus] = useState('');
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [openSession, setOpenSession] = useState(null);
  const [tab, setTab] = useState('activity');

  useEffect(() => {
    let active = true;
    setTopError('');
    Promise.all([api('/teacher/overview'), api('/courses')])
      .then(([summary, catalog]) => { if (active) { setOverview(summary.overview); setCourses(catalog.courses); } })
      .catch((cause) => { if (active) setTopError(cause.message); });
    return () => { active = false; };
  }, [reload]);

  useEffect(() => {
    if (!courseId) { setSimulations([]); return undefined; }
    let active = true;
    api(`/courses/${courseId}/simulations`)
      .then((data) => { if (active) setSimulations(data.simulations); })
      .catch((cause) => { if (active) setSessionError(cause.message); });
    return () => { active = false; };
  }, [courseId, reload]);

  useEffect(() => {
    let active = true;
    setStudentLoading(true); setStudentError('');
    const params = new URLSearchParams({ page: String(studentPage), limit: String(PAGE_SIZE) });
    if (studentSearch) params.set('search', studentSearch);
    api(`/teacher/students?${params}`)
      .then((data) => { if (active) setStudents(data); })
      .catch((cause) => { if (active) setStudentError(cause.message); })
      .finally(() => { if (active) setStudentLoading(false); });
    return () => { active = false; };
  }, [studentPage, studentSearch, reload]);

  useEffect(() => {
    let active = true;
    setSessionLoading(true); setSessionError('');
    const params = new URLSearchParams({ page: String(sessionPage), limit: String(PAGE_SIZE) });
    for (const [key, value] of Object.entries({ courseId, simulationId, studentId, status, search: sessionSearch })) {
      if (value) params.set(key, value);
    }
    api(`/teacher/sessions?${params}`)
      .then((data) => { if (active) setSessions(data); })
      .catch((cause) => { if (active) setSessionError(cause.message); })
      .finally(() => { if (active) setSessionLoading(false); });
    return () => { active = false; };
  }, [sessionPage, courseId, simulationId, studentId, status, sessionSearch, reload]);

  function viewActivity(id) {
    setStudentId(id); setSessionPage(1); setTab('activity');
    requestAnimationFrame(() => sessionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  const metrics = [
    { label: 'Estudiantes inscritos', value: overview?.students, icon: Users, accent: 'blue' },
    { label: 'Simulaciones publicadas', value: overview?.publishedSimulations, icon: BookOpen, accent: 'green' },
    { label: 'Sesiones en curso', value: overview?.activeSessions, icon: CirclePlay, accent: 'violet' },
    { label: 'Sesiones finalizadas', value: overview?.completedSessions, icon: CheckCircle2, accent: 'amber' },
  ];
  const participation = [
    { label: 'Sin iniciar', value: overview?.participation?.notStarted ?? 0, color: 'bg-slate-400' },
    { label: 'En curso', value: overview?.participation?.active ?? 0, color: 'bg-blue-500' },
    { label: 'Finalizada', value: overview?.participation?.completed ?? 0, color: 'bg-emerald-500' },
  ];
  const participationMax = Math.max(1, ...participation.map((item) => item.value));
  const topMax = Math.max(1, ...(overview?.topSimulations ?? []).map((item) => item.startedSessions));

  return <div className="site-container space-y-4 py-5 sm:space-y-5 sm:py-6">
    <header className="flex items-center gap-4 py-1">
      <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700 sm:size-14"><BarChart3 size={25} strokeWidth={2.7} /></span>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-navy sm:text-3xl">Seguimiento académico</h1>
        <p className="mt-0.5 text-sm leading-5 text-slate-600 sm:text-base">Supervisa el avance de tus estudiantes y revisa sus simulaciones.</p>
      </div>
    </header>

    {topError ? <div className="space-y-3"><Message>{topError}</Message><Button variant="secondary" size="sm" onClick={() => setReload((value) => value + 1)}>Reintentar</Button></div> : null}
    <section aria-label="Indicadores académicos" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(({ label, value, icon: Icon, accent }) => <div key={label} className="flex min-h-[104px] min-w-0 items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <span className={`grid size-12 shrink-0 place-items-center rounded-full ${accent === 'blue' ? 'bg-blue-50 text-blue-600' : accent === 'green' ? 'bg-emerald-50 text-emerald-700' : accent === 'violet' ? 'bg-violet-50 text-violet-700' : 'bg-amber-50 text-amber-600'}`}><Icon size={23} aria-hidden="true" /></span>
        <div className="min-w-0"><p className="text-[28px] font-bold leading-none tabular-nums text-navy">{value ?? '—'}</p><p className="mt-1.5 text-sm font-semibold leading-4 text-navy">{label}</p></div>
      </div>)}
    </section>

    <div role="tablist" aria-label="Vistas de seguimiento" className="flex gap-1 border-b border-slate-200">
      {[['activity', 'Actividad', Activity], ['students', 'Estudiantes', Users]].map(([value, label, Icon]) => <button
        key={value} type="button" role="tab" id={`tracking-tab-${value}`}
        aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)}
        onKeyDown={(event) => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); const next = value === 'activity' ? 'students' : 'activity'; setTab(next); document.getElementById(`tracking-tab-${next}`)?.focus(); } }}
        className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-4 text-sm font-semibold transition-colors ${tab === value ? 'border-action text-navy' : 'border-transparent text-slate-600 hover:text-navy'}`}>
        <Icon size={16} aria-hidden="true" />{label}
      </button>)}
    </div>

    {tab === 'students' ? <section id="tracking-panel-students" role="tabpanel" aria-labelledby="tracking-tab-students" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-end">
        <div><h2 id="tracking-students-title" className="text-xl font-semibold text-navy">Estudiantes</h2><p className="mt-1 text-sm text-slate-600">Inscritos en tus cursos, sin duplicados.</p></div>
        <form className="flex w-full gap-2 sm:max-w-sm" onSubmit={(event) => { event.preventDefault(); setStudentPage(1); setStudentSearch(studentInput.trim()); }}>
          <label className="sr-only" htmlFor="tracking-student-search">Buscar por nombre o correo</label>
          <input id="tracking-student-search" value={studentInput} onChange={(event) => setStudentInput(event.target.value)} maxLength={120} placeholder="Nombre o correo" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-action focus:outline-none" />
          <Button type="submit" size="sm" icon={Search}>Buscar</Button>
        </form>
      </div>
      {studentError ? <div className="space-y-3 px-5 pb-5"><Message>{studentError}</Message><Button variant="secondary" size="sm" onClick={() => setReload((value) => value + 1)}>Reintentar</Button></div> : null}
      {studentLoading ? <p role="status" className="px-5 pb-6 text-sm text-slate-600">Cargando estudiantes…</p> : !studentError && students.students.length === 0 ? <p className="px-5 pb-6 text-sm text-slate-600">No hay estudiantes para esta búsqueda.</p> : null}
      {!studentLoading && !studentError && students.students.length > 0 ? <>
        <div className="hidden lg:block"><table className="w-full table-fixed text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th scope="col" className="px-5 py-3">Estudiante</th><th scope="col" className="px-5 py-3">Correo</th><th scope="col" className="px-5 py-3">Cursos inscritos</th><th scope="col" className="px-5 py-3">Iniciadas</th><th scope="col" className="px-5 py-3">Finalizadas</th><th scope="col" className="px-5 py-3">Última actividad</th><th scope="col" className="px-5 py-3">Acción</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{students.students.map((student) => <tr key={student.id}>
            <th scope="row" className="break-words px-4 py-4 font-semibold text-navy">{student.name}</th><td className="break-all px-4 py-4 text-slate-600">{student.email}</td>
            <td className="break-words px-4 py-4 text-slate-600">{student.courses.map((course) => course.title).join(', ')}</td>
            <td className="px-5 py-4">{student.startedSimulations}</td><td className="px-5 py-4">{student.completedSimulations}</td>
            <td className="px-5 py-4 whitespace-nowrap text-slate-600">{formatDate(student.lastActivity)}</td>
            <td className="px-5 py-4"><Button variant="ghost" size="sm" onClick={() => viewActivity(student.id)}>Ver actividad</Button></td>
          </tr>)}</tbody>
        </table></div>
        <div className="divide-y divide-slate-100 lg:hidden">{students.students.map((student) => <article key={student.id} className="space-y-3 p-5 text-sm">
          <div><h3 className="font-semibold text-navy">{student.name}</h3><p className="break-all text-slate-600">{student.email}</p></div>
          <p className="break-words text-slate-600"><strong className="text-navy">Cursos:</strong> {student.courses.map((course) => course.title).join(', ')}</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-slate-600"><span>Iniciadas: <strong className="text-navy">{student.startedSimulations}</strong></span><span>Finalizadas: <strong className="text-navy">{student.completedSimulations}</strong></span></div>
          <p className="text-slate-600">Última actividad: {formatDate(student.lastActivity)}</p>
          <Button variant="secondary" size="sm" onClick={() => viewActivity(student.id)}>Ver actividad</Button>
        </article>)}</div><Pager page={studentPage} total={students.total} onChange={setStudentPage} />
      </> : null}
    </section> : null}

    {tab === 'activity' ? <div id="tracking-panel-activity" role="tabpanel" aria-labelledby="tracking-tab-activity" className="space-y-4">
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(290px,3fr)]">
    <section ref={sessionsRef} className="min-w-0 scroll-mt-24 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="tracking-sessions-title">
      <div className="flex items-start gap-3 px-4 pb-3 pt-4"><span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-action"><Activity size={19} /></span><div><h2 id="tracking-sessions-title" className="text-lg font-semibold leading-6 text-navy">Actividad por simulación</h2><p className="text-xs leading-5 text-slate-600">Consulta quién ha iniciado, está realizando o finalizó cada simulación.</p></div></div>
      <div className="grid gap-2 px-4 pb-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,.8fr)_minmax(0,1.1fr)_auto] xl:items-end">
        <label className="min-w-0 space-y-1 text-xs font-semibold text-slate-600">Curso<select value={courseId} onChange={(event) => { setCourseId(event.target.value); setSimulationId(''); setSessionPage(1); }} className="h-9 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 text-xs font-normal text-navy"><option value="">Todos los cursos</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label>
        <label className="min-w-0 space-y-1 text-xs font-semibold text-slate-600">Simulación<select value={simulationId} disabled={!courseId} onChange={(event) => { setSimulationId(event.target.value); setSessionPage(1); }} className="h-9 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 text-xs font-normal text-navy disabled:opacity-50"><option value="">Todas las simulaciones</option>{simulations.map((simulation) => <option key={simulation.id} value={simulation.id}>{simulation.title}</option>)}</select></label>
        <label className="min-w-0 space-y-1 text-xs font-semibold text-slate-600">Estado<select value={status} onChange={(event) => { setStatus(event.target.value); setSessionPage(1); }} className="h-9 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 text-xs font-normal text-navy"><option value="">Todos los estados</option>{Object.entries(STATUS).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</select></label>
        <form className="min-w-0 space-y-1" onSubmit={(event) => { event.preventDefault(); setSessionPage(1); setSessionSearch(sessionInput.trim()); }}><label htmlFor="tracking-session-search" className="block text-xs font-semibold text-slate-600">Estudiante</label><div className="flex min-w-0"><input id="tracking-session-search" value={sessionInput} onChange={(event) => setSessionInput(event.target.value)} maxLength={120} placeholder="Nombre o correo" className="h-9 min-w-0 w-full rounded-l-md border border-r-0 border-slate-300 px-2 text-xs focus:border-action focus:outline-none" /><button type="submit" aria-label="Buscar actividad" className="grid size-9 shrink-0 place-items-center rounded-r-md border border-slate-300 bg-white text-action hover:bg-blue-50"><Search size={15} aria-hidden="true" /></button></div></form>
        <Button variant="secondary" size="sm" className="!min-h-9 !px-2 !text-xs sm:col-span-2 xl:col-span-1" icon={RotateCcw} onClick={() => { setCourseId(''); setSimulationId(''); setStatus(''); setStudentId(''); setSessionInput(''); setSessionSearch(''); setSessionPage(1); }}>Limpiar filtros</Button>
        {studentId ? <div className="sm:col-span-2 xl:col-span-5"><Button variant="ghost" size="sm" onClick={() => { setStudentId(''); setSessionPage(1); }}>Quitar filtro de estudiante</Button></div> : null}
      </div>
      {sessionError ? <div className="space-y-3 px-5 py-4"><Message>{sessionError}</Message><Button variant="secondary" size="sm" onClick={() => setReload((value) => value + 1)}>Reintentar</Button></div> : null}
      {sessionLoading ? <p role="status" className="px-5 py-6 text-sm text-slate-600">Cargando actividad…</p> : !sessionError && sessions.sessions.length === 0 ? <p className="px-5 py-6 text-sm text-slate-600">No hay actividad para estos filtros.</p> : null}
      {!sessionLoading && !sessionError && sessions.sessions.length > 0 ? <>
        <div className="hidden xl:block"><table className="w-full table-fixed text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th scope="col" className="w-[18%] px-2 py-2.5">Estudiante</th><th scope="col" className="w-[12%] px-2 py-2.5">Curso</th><th scope="col" className="w-[19%] px-2 py-2.5">Simulación</th><th scope="col" className="w-[12%] px-2 py-2.5">Estado</th><th scope="col" className="w-[12%] px-2 py-2.5">Inicio</th><th scope="col" className="w-[12%] px-2 py-2.5">Última actividad</th><th scope="col" className="w-[15%] px-2 py-2.5">Acción</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{sessions.sessions.map((session, index) => <tr key={session.id ?? `${session.studentId}-${session.simulationId}`} className="h-[62px] transition-colors hover:bg-slate-50/70">
            <th scope="row" className="px-2 py-2 font-semibold text-navy"><span className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className={`grid size-7 shrink-0 place-items-center rounded-full text-[10px] ${index % 2 ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-action'}`}>{session.studentName?.trim().charAt(0).toUpperCase() || '?'}</span><span className="min-w-0 truncate" title={session.studentName}>{session.studentName}</span></span></th><td className="px-2 py-2 text-slate-600"><span className="block truncate" title={session.courseTitle}>{session.courseTitle}</span></td><td className="px-2 py-2 text-slate-600"><span className="block truncate" title={session.simulationTitle} aria-label={session.simulationTitle}>{session.simulationTitle}</span></td>
            <td className="px-2 py-2"><Status value={session.status} /></td><td className="px-2 py-2"><DateCell value={session.startedAt} /></td><td className="px-2 py-2"><DateCell value={session.lastActivityAt} /></td>
            <td className="px-2 py-2">{session.id ? <Button variant="secondary" size="sm" icon={MessageSquareText} className="!min-h-8 !gap-1 !px-1.5 !text-[11px]" onClick={() => setOpenSession(session.id)}>Ver conversación</Button> : <span className="text-xs text-slate-500">Sin conversación</span>}</td>
          </tr>)}</tbody>
        </table></div>
        <div className="divide-y divide-slate-100 xl:hidden">{sessions.sessions.map((session) => <article key={session.id ?? `${session.studentId}-${session.simulationId}`} className="space-y-3 p-5 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold text-navy">{session.studentName}</h3><Status value={session.status} /></div>
          <div className="min-w-0"><p className="text-xs text-slate-500">{session.courseTitle}</p><p className="truncate font-medium text-navy" title={session.simulationTitle} aria-label={session.simulationTitle}>{session.simulationTitle}</p></div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600"><span>Inicio: {formatDate(session.startedAt)}</span><span>Última actividad: {formatDate(session.lastActivityAt)}</span></div>
          {session.id ? <Button variant="secondary" size="sm" icon={MessageSquareText} onClick={() => setOpenSession(session.id)}>Ver conversación</Button> : <p className="text-xs text-slate-500">Sin conversación</p>}
        </article>)}</div><Pager page={sessionPage} total={sessions.total} onChange={setSessionPage} />
      </> : null}
    </section>
    <aside className="self-start rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:col-start-2 xl:row-span-2 xl:row-start-1" aria-labelledby="tracking-summary-title">
      <div className="flex items-center gap-2"><span aria-hidden="true" className="grid size-9 place-items-center rounded-lg bg-blue-50 text-action"><BarChart3 size={18} /></span><h2 id="tracking-summary-title" className="text-lg font-semibold text-navy">Resumen rápido</h2></div>
      <div className="mt-5 space-y-3.5">
        <h3 className="text-sm font-semibold text-navy">Estado de participación</h3>
        {overview ? participation.map((item) => <div key={item.label} className="space-y-1.5">
          <div className="flex justify-between gap-2 text-sm"><span className="text-slate-600">{item.label}</span><strong className="tabular-nums text-navy">{item.value}</strong></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.value / participationMax * 100}%` }} /></div>
        </div>) : <p className="text-sm text-slate-500">{topError ? 'No se pudo cargar el resumen.' : 'Cargando resumen…'}</p>}
        <p className="text-xs leading-5 text-slate-500">Sin iniciar cuenta estudiantes por simulación publicada sin sesión. En curso y finalizada cuentan sesiones; las barras no son calificaciones.</p>
      </div>
      <div className="mt-5 border-t border-slate-100 pt-4">
        <h3 className="text-sm font-semibold text-navy">Simulaciones con más actividad</h3>
        {overview?.topSimulations?.length ? <div className="mt-3 space-y-3">{overview.topSimulations.map((item) => <div key={item.id} className="space-y-1.5">
          <div className="flex min-w-0 justify-between gap-2 text-sm"><span className="min-w-0 truncate text-slate-700" title={item.title} aria-label={item.title}>{item.title}</span><strong className="shrink-0 tabular-nums text-navy">{item.startedSessions}</strong></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-500" style={{ width: `${item.startedSessions / topMax * 100}%` }} /></div>
        </div>)}</div> : <p className="mt-3 text-sm text-slate-500">{overview ? 'Aún no hay sesiones iniciadas.' : topError ? 'Datos no disponibles.' : 'Cargando simulaciones…'}</p>}
        <p className="mt-3 text-xs text-slate-500">Número de sesiones iniciadas.</p>
      </div>
    </aside>
    <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm xl:col-start-1 xl:row-start-2" aria-labelledby="tracking-recent-title">
      <div className="flex items-start gap-3 px-4 py-4"><span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-action"><MessageSquareText size={18} /></span><div><h2 id="tracking-recent-title" className="text-lg font-semibold leading-6 text-navy">Conversaciones recientes</h2><p className="text-xs leading-5 text-slate-600">Últimas sesiones con mensajes de tus estudiantes.</p></div></div>
      {overview?.recentConversations?.length ? <div className="grid gap-2 px-4 pb-4 md:grid-cols-2 xl:grid-cols-3">{overview.recentConversations.slice(0, 3).map((item) => <article key={item.id} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/30 p-3">
        <div className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-blue-100 text-xs font-semibold text-action">{item.studentName?.trim().charAt(0).toUpperCase() || '?'}</span><div className="min-w-0 flex-1"><h3 className="truncate text-xs font-semibold text-navy" title={item.studentName}>{item.studentName}</h3><p className="truncate text-[11px] text-slate-600" title={item.simulationTitle}>{item.simulationTitle}</p></div></div>
        <div className="mt-3 flex flex-wrap items-center gap-2"><Status value={item.status} /><time dateTime={item.lastActivityAt} className="text-[11px] text-slate-500">{formatDate(item.lastActivityAt)}</time></div>
        <Button variant="secondary" size="sm" icon={MessageSquareText} className="mt-3 !min-h-8 !px-2 !text-xs" onClick={() => setOpenSession(item.id)}>Abrir conversación</Button>
      </article>)}</div> : <p className="px-4 pb-4 text-sm text-slate-600">{overview ? 'Todavía no hay conversaciones con mensajes.' : topError ? 'Datos no disponibles.' : 'Cargando conversaciones…'}</p>}
    </section>
    </div>
    </div> : null}
    <ConversationModal sessionId={openSession} onClose={() => setOpenSession(null)} />
  </div>;
}
