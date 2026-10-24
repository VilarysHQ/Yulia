import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, ChevronDown, ClipboardList, Download, ExternalLink, KeyRound,
  Lightbulb, MessageCircle, Send, Sparkles, Target, UserRound,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Message } from '../components/ui/Message';
import { Modal } from '../components/ui/Modal';
import { RichText } from '../components/ui/RichText';
import { TextField } from '../components/ui/Field';
import { YuliaAvatar } from '../components/brand/YuliaAvatar';
import { useToast } from '../context/ToastContext';
import { api } from './api';
import { useAuth } from './AuthContext';
import { downloadConversationExport } from './conversationExport';
import { clearGeminiKey, getGeminiKey, setGeminiKey } from './geminiKey';
import { ProtectedSimulationContent } from './ProtectedSimulationContent';

const timeFormatter = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' });

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : timeFormatter.format(date);
}

export function SimulationDetailPage() {
  const { simulationId } = useParams();
  const { user } = useAuth();
  const { push } = useToast();
  const [simulation, setSimulation] = useState(null);
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [key, setKey] = useState(() => getGeminiKey(user?.id));
  const [keyDraft, setKeyDraft] = useState('');
  const [editingKey, setEditingKey] = useState(!getGeminiKey(user?.id));
  const [draft, setDraft] = useState('');
  const [scenarioOpen, setScenarioOpen] = useState(true);
  const [objectiveOpen, setObjectiveOpen] = useState(true);
  const [guideOpen, setGuideOpen] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const endRef = useRef(null);
  const completed = session?.status === 'completed';
  const protectTutorContent = user?.role === 'student';
  useEffect(() => {
    let active = true;
    Promise.all([api(`/simulations/${simulationId}`), api(`/simulations/${simulationId}/session`)])
      .then(([detail, conversation]) => {
        if (!active) return;
        setSimulation(detail.simulation);
        setSession(conversation.session);
        setMessages(conversation.messages);
      })
      .catch((cause) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [simulationId]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [messages.length]);

  async function testKey(event) {
    event.preventDefault();
    if (!keyDraft.trim()) {
      setError('Introduce tu API key de Gemini.');
      push({ tone: 'error', title: 'Clave vacía', description: 'Introduce tu API key de Gemini para probar la conexión.' });
      return;
    }
    setBusy(true); setError(''); setNotice('');
    try {
      await api('/gemini/test', { method: 'POST', body: JSON.stringify({ apiKey: keyDraft.trim() }) });
      setGeminiKey(user.id, keyDraft.trim()); setKey(keyDraft.trim()); setKeyDraft('');
      setEditingKey(false); setNotice('Gemini conectado correctamente.');
      push({ tone: 'success', title: 'Clave API válida', description: 'Tu tutor IA quedó conectado correctamente.' });
    } catch (cause) {
      setError(cause.message);
      push({ tone: 'error', title: 'Clave API no válida', description: cause.message });
    }
    finally { setBusy(false); }
  }

  function removeKey() {
    clearGeminiKey(); setKey(''); setKeyDraft(''); setEditingKey(true); setNotice(''); setError('');
  }

  async function reloadConversation() {
    const result = await api(`/simulations/${simulationId}/session`);
    setSession(result.session);
    setMessages(result.messages);
  }

  async function start() {
    if (!key) return setError('Configura tu API key de Gemini primero.');
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api(`/simulations/${simulationId}/sessions`, { method: 'POST', body: JSON.stringify({ apiKey: key }) });
      setSession(result.session); setMessages(result.messages);
    } catch (cause) {
      if (cause.status === 409) {
        try { await reloadConversation(); } catch (reloadError) { setError(reloadError.message); }
      } else setError(cause.message);
    } finally { setBusy(false); }
  }

  async function finishSimulation() {
    if (!session || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api(`/sessions/${session.id}/complete`, { method: 'POST' });
      setSession(result.session);
      setConfirmFinish(false);
      push({ tone: 'success', title: 'Simulación finalizada', description: 'Ya no admite nuevas respuestas. Puedes revisar o exportar la conversación.' });
    } catch (cause) {
      setError(cause.message);
      setConfirmFinish(false);
    } finally { setBusy(false); }
  }

  function closeFinish() {
    if (!busy) setConfirmFinish(false);
  }

  async function send(event) {
    event?.preventDefault();
    const content = draft.trim();
    if (!content || busy || completed) return;
    if (!key) return setError('Configura tu API key de Gemini para continuar.');
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api(`/sessions/${session.id}/messages`, { method: 'POST', body: JSON.stringify({
        apiKey: key, content, expectedLastSequence: messages.at(-1)?.sequenceNumber ?? 0,
      }) });
      setMessages((current) => [...current, ...result.messages]); setDraft('');
    } catch (cause) {
      setError(cause.message);
      if (cause.status === 409) await reloadConversation().catch(() => {});
    }
    finally { setBusy(false); }
  }

  function exportConversation() {
    if (!simulation || !messages.length) return;
    try {
      downloadConversationExport({
        simulationTitle: simulation.title,
        studentName: user?.name,
        messages,
      });
      push({ tone: 'success', title: 'Conversación exportada', description: 'Se descargó el archivo .txt con la conversación completa.' });
    } catch (cause) {
      push({ tone: 'error', title: 'No se pudo exportar', description: cause.message });
    }
  }

  if (loading) return (
    <div className="sim-page" role="status" aria-live="polite">
      <div className="sim-loading">
        <span className="sim-loading-orb" aria-hidden="true" />
        <p className="sim-loading-text">Preparando la simulación…</p>
      </div>
    </div>
  );

  if (!simulation) return (
    <div className="sim-page">
      <div className="sim-app sim-app-center">
        <Message tone="error">{error || 'Simulación no disponible'}</Message>
      </div>
    </div>
  );

  const courseHref = `/estudiante/cursos/${simulation.courseId}`;

  return (
    <div className="sim-page">
      <div className="sim-app">
        {/* Cabecera compacta: breadcrumb, badge, título real y acción de volver. */}
        <header className="sim-header">
          <div className="sim-header-main">
            <nav className="sim-breadcrumb" aria-label="Ruta de navegación">
              <Link to="/estudiante" className="sim-breadcrumb-link">Cursos</Link>
              <span className="sim-breadcrumb-sep" aria-hidden="true">/</span>
              <Link to={courseHref} className="sim-breadcrumb-link">Curso</Link>
              <span className="sim-breadcrumb-sep" aria-hidden="true">/</span>
              <span className="sim-breadcrumb-current" aria-current="page">Simulación</span>
            </nav>
            <span className="sim-badge">
              <Sparkles size={13} aria-hidden="true" /> Simulación del curso
            </span>
            <h1 className="sim-title">{simulation.title}</h1>
            <p className="sim-subtitle">Conversación guiada por Yulia a partir del caso clínico.</p>
          </div>
          <Link to={courseHref} className="sim-back">
            <ArrowLeft size={15} aria-hidden="true" /> Volver al curso
          </Link>
        </header>

        <div className="sim-body">
          {/* Sidebar informativa: caso en acordeones + acceso al tutor IA. */}
          <aside className="sim-sidebar" aria-label="Información de la simulación">
            <section className={`sim-acc ${scenarioOpen ? 'sim-acc-open' : ''}`}>
              <button
                type="button"
                className="sim-acc-head"
                aria-expanded={scenarioOpen}
                onClick={() => setScenarioOpen((value) => !value)}
              >
                <span className="sim-acc-icon sim-acc-icon-green" aria-hidden="true"><ClipboardList size={18} strokeWidth={1.9} /></span>
                <span className="sim-acc-headtext">
                  <span className="sim-acc-title">Escenario</span>
                  <span className="sim-acc-hint">Situación clínica</span>
                </span>
                <ChevronDown className="sim-acc-chevron" size={18} aria-hidden="true" />
              </button>
              <div className="sim-acc-panel">
                <ProtectedSimulationContent className="sim-acc-content" enabled={protectTutorContent}>
                  <RichText content={simulation.scenario} />
                </ProtectedSimulationContent>
              </div>
            </section>

            <section className={`sim-acc ${objectiveOpen ? 'sim-acc-open' : ''}`}>
              <button
                type="button"
                className="sim-acc-head"
                aria-expanded={objectiveOpen}
                onClick={() => setObjectiveOpen((value) => !value)}
              >
                <span className="sim-acc-icon sim-acc-icon-blue" aria-hidden="true"><Target size={18} strokeWidth={1.9} /></span>
                <span className="sim-acc-headtext">
                  <span className="sim-acc-title">Objetivo</span>
                  <span className="sim-acc-hint">Qué debes lograr</span>
                </span>
                <ChevronDown className="sim-acc-chevron" size={18} aria-hidden="true" />
              </button>
              <div className="sim-acc-panel">
                <ProtectedSimulationContent className="sim-acc-content" enabled={protectTutorContent}>
                  <RichText content={simulation.objective} />
                </ProtectedSimulationContent>
              </div>
            </section>

            <section className={`sim-acc sim-acc-guide ${guideOpen ? 'sim-acc-open' : ''}`}>
              <button
                type="button"
                className="sim-acc-head"
                aria-expanded={guideOpen}
                onClick={() => setGuideOpen((value) => !value)}
              >
                <span className="sim-acc-icon sim-acc-icon-soft" aria-hidden="true"><Lightbulb size={18} strokeWidth={1.9} /></span>
                <span className="sim-acc-headtext">
                  <span className="sim-acc-title">Guía de la simulación</span>
                  <span className="sim-acc-hint">Cómo interactuar</span>
                </span>
                <ChevronDown className="sim-acc-chevron" size={18} aria-hidden="true" />
              </button>
              <div className="sim-acc-panel">
                <ProtectedSimulationContent className="sim-acc-content sim-acc-content-guide" enabled={protectTutorContent}>
                  <p>Responde con tu razonamiento como si atendieras el caso. Yulia te hará preguntas, dará pistas y retroalimentará tus respuestas.</p>
                  <ul>
                    <li>Escribe con tus propias palabras.</li>
                    <li>Justifica tus decisiones clínicas.</li>
                    <li>Usa <kbd>Enter</kbd> para enviar y <kbd>Shift</kbd>+<kbd>Enter</kbd> para una línea nueva.</li>
                  </ul>
                </ProtectedSimulationContent>
              </div>
            </section>

            {/* Tutor IA: bloque compacto que no compite con el chat. */}
            <section className={`sim-key ${key ? 'sim-key-ok' : ''}`} aria-label="Conexión con el tutor IA">
              {key ? (
                <div className="sim-key-connected">
                  <span className="sim-key-status">
                    <span className="sim-key-status-dot" aria-hidden="true" /> Tutor conectado
                  </span>
                  <div className="sim-key-actions">
                    <Button size="sm" variant="ghost" onClick={() => { setEditingKey(true); setNotice(''); }}>Cambiar</Button>
                    <Button size="sm" variant="ghost" onClick={removeKey}>Quitar</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="sim-key-head">
                    <span className="sim-key-icon" aria-hidden="true"><KeyRound size={16} strokeWidth={1.9} /></span>
                    <div className="sim-key-headtext">
                      <p className="sim-key-title">Conecta tu tutor IA</p>
                      <p className="sim-key-sub">Tu clave de Gemini, solo en esta pestaña.</p>
                    </div>
                  </div>
                  <p className="sim-key-help">
                    Necesitas una clave de Gemini para conversar con Yulia. Puedes obtenerla desde Google AI Studio.
                  </p>
                  <a
                    href="https://aistudio.google.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sim-key-get"
                  >
                    <ExternalLink size={14} aria-hidden="true" /> Obtener clave de Gemini
                  </a>
                  <p className="sim-key-hint">
                    Una vez creada, copia tu clave, vuelve a Yulia y pégala aquí.
                  </p>
                  <form onSubmit={testKey} className="sim-key-form">
                    <TextField
                      label="API key de Gemini"
                      type="password"
                      autoComplete="off"
                      value={keyDraft}
                      onChange={(event) => { setKeyDraft(event.target.value); setError(''); }}
                      icon={KeyRound}
                    />
                    <div className="sim-key-actions">
                      <Button type="submit" size="sm" disabled={busy || !keyDraft.trim()} icon={Sparkles}>
                        {busy ? 'Probando…' : 'Probar conexión'}
                      </Button>
                      {key ? <Button size="sm" variant="ghost" onClick={() => setEditingKey(false)}>Cancelar</Button> : null}
                    </div>
                  </form>
                </>
              )}
            </section>
          </aside>

          {/* Chat protagonista: ocupa el espacio restante y toda la altura. */}
          <section className="sim-chat" aria-label="Conversación de la simulación">
            <header className="sim-chat-head">
              <div className="sim-chat-tutor">
                <span className="sim-chat-avatar" aria-hidden="true">
                  <YuliaAvatar size="md" decorative priority />
                </span>
                <div className="sim-chat-id">
                  <p className="sim-chat-name">Yulia IA</p>
                  <p className="sim-chat-role">Tu tutora en bioquímica nutricional</p>
                  <span className={`sim-chat-online ${completed ? 'sim-chat-online-done' : ''}`}>
                    <span className="sim-chat-online-dot" aria-hidden="true" />
                    {session ? (completed ? 'Finalizada' : 'En línea') : 'Disponible'}
                  </span>
                </div>
              </div>
              <div className="sim-chat-actions">
                {session && !completed ? (
                  <button
                    type="button"
                    className="sim-finish"
                    onClick={() => setConfirmFinish(true)}
                    disabled={busy}
                    aria-label="Finalizar simulación"
                  >
                    <CheckCircle2 size={17} aria-hidden="true" />
                    <span>Finalizar simulación</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  className="sim-export"
                  onClick={exportConversation}
                  disabled={messages.length === 0}
                  aria-label="Exportar conversación"
                  title={messages.length === 0 ? 'Aún no hay una conversación para exportar.' : undefined}
                >
                  <Download size={17} aria-hidden="true" />
                  <span>Exportar conversación</span>
                </button>
              </div>
            </header>

            {!session ? (
              <div className="sim-chat-empty">
                <span className="sim-chat-empty-icon" aria-hidden="true">
                  <YuliaAvatar size="lg" decorative />
                </span>
                <h3 className="sim-chat-empty-title">Empieza el diálogo con Yulia</h3>
                <p className="sim-chat-empty-text">
                  {key
                    ? 'Yulia abrirá la conversación a partir del caso de la docente.'
                    : 'Primero conecta tu tutor IA con tu clave de Gemini para comenzar.'}
                </p>
                <Button disabled={!key || busy} onClick={start} icon={Sparkles} className="sim-start-cta">
                  {busy ? 'Yulia está pensando…' : 'Iniciar simulación'}
                </Button>
              </div>
            ) : (
              <>
                <div role="log" aria-label="Conversación de la simulación" className="sim-thread">
                  {messages.map((message) => {
                    const isStudent = message.role === 'student';
                    const time = formatTime(message.createdAt);
                    return (
                      <div key={message.id} className={`sim-row ${isStudent ? 'sim-row-student' : 'sim-row-tutor'}`}>
                        {isStudent ? (
                          <span className="sim-avatar sim-avatar-student" aria-hidden="true"><UserRound size={18} strokeWidth={1.9} /></span>
                        ) : (
                          <span className="sim-avatar sim-avatar-tutor" aria-hidden="true"><YuliaAvatar size="sm" decorative /></span>
                        )}
                        <div className={`sim-bubble ${isStudent ? 'sim-bubble-student' : 'sim-bubble-tutor'}`}>
                          <p className="sim-bubble-label">{isStudent ? 'Tú' : 'Yulia IA'}</p>
                          <ProtectedSimulationContent
                            as="p"
                            className="sim-bubble-text"
                            enabled={protectTutorContent && !isStudent}
                          >
                            {message.content}
                          </ProtectedSimulationContent>
                          {time ? <time className="sim-bubble-time" dateTime={message.createdAt}>{time}</time> : null}
                        </div>
                      </div>
                    );
                  })}

                  {busy ? (
                    <div className="sim-row sim-row-tutor">
                      <span className="sim-avatar sim-avatar-tutor" aria-hidden="true"><YuliaAvatar size="sm" decorative /></span>
                      <div className="sim-bubble sim-bubble-tutor sim-bubble-typing" role="status">
                        <span className="sim-typing-dot" /> <span className="sim-typing-dot" /> <span className="sim-typing-dot" />
                        <span className="sr-only">Yulia está respondiendo…</span>
                      </div>
                    </div>
                  ) : null}
                  <div ref={endRef} />
                </div>

                <form onSubmit={send} className="sim-composer">
                  {completed ? (
                    <div className="sim-finished" role="status">
                      <span className="sim-finished-icon" aria-hidden="true"><CheckCircle2 size={18} /></span>
                      <div>
                        <p className="sim-finished-title">Simulación finalizada</p>
                        <p className="sim-finished-text">Esta conversación ya no admite nuevas respuestas. Puedes revisar el historial o exportarlo.</p>
                      </div>
                    </div>
                  ) : null}
                  {notice ? <Message tone="success" className="sim-msg">{notice}</Message> : null}
                  {error ? <Message tone="error" className="sim-msg">{error} {session && !completed && draft.trim() ? 'Puedes reintentar el envío.' : null}</Message> : null}
                  <div className="sim-composer-box">
                    <textarea
                      rows={1}
                      maxLength={4000}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); }
                      }}
                      placeholder={completed ? 'La simulación está finalizada' : 'Escribe tu respuesta…'}
                      aria-label="Tu respuesta"
                      disabled={busy || !key || completed}
                      className="sim-composer-input"
                    />
                    <Button
                      type="submit"
                      disabled={busy || !key || !draft.trim() || completed}
                      icon={Send}
                      iconPosition="end"
                      className="sim-send-cta"
                    >
                      {busy ? 'Enviando…' : 'Enviar'}
                    </Button>
                  </div>
                  {completed ? null : (
                    <p className="sim-composer-note">
                      <MessageCircle size={13} aria-hidden="true" />
                      Enter para enviar · Shift+Enter para una línea nueva · {draft.length}/4000
                    </p>
                  )}
                </form>
              </>
            )}
          </section>
        </div>
      </div>

      <Modal
        open={confirmFinish}
        onClose={closeFinish}
        title="Finalizar simulación"
        description="¿Seguro que quieres finalizar esta simulación?"
        footer={
          <>
            <Button variant="secondary" onClick={closeFinish} disabled={busy}>Cancelar</Button>
            <Button icon={CheckCircle2} onClick={finishSimulation} disabled={busy}>
              {busy ? 'Finalizando…' : 'Finalizar simulación'}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-6 text-slate-600">
          Después de finalizar ya no podrás enviar más respuestas, pero podrás seguir revisando y exportando la conversación.
        </p>
      </Modal>
    </div>
  );
}
