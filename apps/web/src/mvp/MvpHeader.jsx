import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { GraduationCap, Menu, X } from 'lucide-react';
import { useAuth } from './AuthContext';
import { Button } from '../components/ui/Button';
import yuliaLogo from '../assets/yulia/logo-yulia.jpeg';

export function MvpHeader() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const active = location.pathname.startsWith('/docente/seguimiento')
    ? 'tracking'
    : location.pathname === '/'
    ? 'home'
    : location.pathname.startsWith('/acerca')
      ? 'about'
      : location.pathname.startsWith('/cursos') || location.pathname.startsWith('/docente') || location.pathname.startsWith('/estudiante')
        ? 'courses'
        : location.pathname.startsWith('/videos')
          ? 'videos'
          : '';

  const isTeacher = user?.role === 'teacher';
  const roleLabel = isTeacher ? 'Docente' : user ? 'Estudiante' : '';
  const initial = user?.name?.trim()?.charAt(0)?.toUpperCase() ?? '?';

  const links = [
    { key: 'home', to: '/', label: 'Inicio', current: 'page' },
    { key: 'courses', to: '/cursos', label: 'Cursos', current: 'page' },
    { key: 'videos', to: '/videos', label: 'Videos', current: 'page' },
    { key: 'about', to: '/acerca', label: 'Acerca de', current: 'page' },
    ...(isTeacher ? [{ key: 'tracking', to: '/docente/seguimiento', label: 'Seguimiento académico', current: 'page' }] : []),
  ];

  const handleLogout = async () => {
    await logout();
    navigate('/acceso');
  };

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.hash]);

  // El menú móvil es un disclosure, no un diálogo: sin `aria-modal` ni trampa de
  // foco. Escape lo cierra y devuelve el foco al botón que lo abrió.
  useEffect(() => {
    if (!menuOpen) return undefined;
    function handleKeyDown(event) {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen]);

  const sessionChip = user ? (
    <span className="mvp-role-chip">
      <span className="mvp-role-avatar" aria-hidden="true">{initial}</span>
      <span className="mvp-role-meta">
        <span className="mvp-role-name">{user.name}</span>
        <span className="mvp-role-label">{roleLabel}</span>
      </span>
    </span>
  ) : null;

  return (
    <header className={`mvp-header sticky top-0 z-30 ${isTeacher ? 'mvp-header-teacher' : 'border-b border-[#dce8d8] bg-[#fbfcf8]'}`}>
      <div className="site-container mvp-header-inner">
        <div className="mvp-brand-wrap">
          <Link to="/" className="mvp-brand" aria-label="Bromatología y Nutrición. Ir al inicio">
            <img src={yuliaLogo} alt="" className="mvp-brand-logo" />
            <span className="mvp-brand-text">Bromatología y Nutrición</span>
          </Link>
          {isTeacher ? (
            <span className="mvp-teacher-badge">
              <GraduationCap size={13} aria-hidden="true" /> Modo docente
            </span>
          ) : null}
        </div>

        <nav aria-label="Navegación principal" className="mvp-nav hidden items-center gap-1 lg:flex">
          {links.map(({ key, to, label, current }) => (
            <Link
              key={key}
              to={to}
              aria-current={active === key ? current : undefined}
              className={`nav-link ${active === key ? 'nav-link-active' : ''}`}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="mvp-actions hidden items-center gap-2.5 lg:flex">
          {user ? (
            <>
              {sessionChip}
              <button type="button" className="nav-link" onClick={handleLogout}>Salir</button>
            </>
          ) : (
            <Button to="/acceso" size="sm" className="mvp-header-cta">Comenzar</Button>
          )}
        </div>

        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="navegacion-movil"
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          className="mvp-menu-button"
        >
          {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
      </div>

      {menuOpen ? (
        <div id="navegacion-movil" className="mvp-mobile-menu">
          <nav aria-label="Navegación principal móvil" className="site-container py-3">
            {user ? (
              <div className="mvp-mobile-role">
                <span className="mvp-role-avatar" aria-hidden="true">{initial}</span>
                <span className="mvp-role-meta">
                  <span className="mvp-role-name">{user.name}</span>
                  <span className="mvp-role-label">{roleLabel}</span>
                </span>
              </div>
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {links.map(({ key, to, label, current }) => (
                <li key={key}>
                  <Link
                    to={to}
                    aria-current={active === key ? current : undefined}
                    className={`mvp-mobile-link ${active === key ? 'mvp-mobile-link-active' : ''}`}
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-3 border-t border-[#dce8d8] pt-3">
              {user ? (
                <button type="button" onClick={handleLogout} className="mvp-mobile-link w-full">Salir</button>
              ) : (
                <Button to="/acceso" size="md" className="mvp-header-cta w-full">Comenzar</Button>
              )}
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
