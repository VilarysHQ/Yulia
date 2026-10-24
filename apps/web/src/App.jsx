import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './mvp/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { AboutPage } from './mvp/AboutPage';
import { AuthPage } from './mvp/AuthPage';
import { CourseEditorPage } from './mvp/CourseEditorPage';
import { CoursePage } from './mvp/CoursePage';
import { CoursesPage } from './mvp/CoursesPage';
import { HomePage } from './mvp/HomePage';
import { MvpShell } from './mvp/MvpShell';
import { RouteGuard } from './mvp/RouteGuard';
import { ScrollToTop } from './mvp/ScrollToTop';
import { SimulationDetailPage } from './mvp/SimulationDetailPage';
import { SimulationEditorPage } from './mvp/SimulationEditorPage';
import { VideoDetailPage } from './mvp/VideoDetailPage';
import { VideoEditorPage } from './mvp/VideoEditorPage';
import { VideosPage } from './mvp/VideosPage';
import { TeacherTrackingPage } from './mvp/TeacherTrackingPage';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  return <ToastProvider><AuthProvider><ScrollToTop /><Routes>
    <Route element={<MvpShell />}>
      <Route path="/" element={<HomePage />} />
      <Route path="/acerca" element={<AboutPage />} />
      <Route path="/acceso" element={<AuthPage mode="login" />} />
      <Route path="/registro" element={<AuthPage mode="register" />} />
      <Route path="/cursos" element={<CoursesPage />} />
      <Route path="/videos" element={<VideosPage />} />
      <Route path="/videos/:videoId" element={<VideoDetailPage />} />
      <Route element={<RouteGuard role="teacher" />}>
        <Route path="/docente" element={<CoursesPage />} />
        <Route path="/docente/seguimiento" element={<TeacherTrackingPage />} />
        <Route path="/docente/cursos/nuevo" element={<CourseEditorPage />} />
        <Route path="/docente/cursos/:courseId" element={<CoursePage />} />
        <Route path="/docente/cursos/:courseId/editar" element={<CourseEditorPage />} />
        <Route path="/docente/cursos/:courseId/simulaciones/nueva" element={<SimulationEditorPage />} />
        <Route path="/docente/simulaciones/:simulationId/editar" element={<SimulationEditorPage />} />
        <Route path="/docente/videos/nuevo" element={<VideoEditorPage />} />
        <Route path="/docente/videos/:videoId/editar" element={<VideoEditorPage />} />
      </Route>
      <Route element={<RouteGuard role="student" />}>
        <Route path="/estudiante" element={<CoursesPage />} />
        <Route path="/estudiante/cursos/:courseId" element={<CoursePage />} />
        <Route path="/estudiante/simulaciones/:simulationId" element={<SimulationDetailPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Route>
  </Routes></AuthProvider></ToastProvider>;
}
