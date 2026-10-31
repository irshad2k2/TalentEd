import { Link, Route, Routes } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { ProtectedRoute } from './components/ProtectedRoute';
import { EmptyState } from './components/ui';
import { LoginPage, SignupPage } from './pages/AuthPages';
import { CatalogPage } from './pages/CatalogPage';
import { CourseEditorPage } from './pages/CourseEditorPage';
import { CoursePage } from './pages/CoursePage';
import { EducatorDashboard } from './pages/EducatorDashboard';
import { LessonPage } from './pages/LessonPage';
import { MyLearningPage } from './pages/MyLearningPage';
import { QuizPage } from './pages/QuizPage';
import { SharePage } from './pages/SharePage';

export function App() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Routes>
          <Route path="/" element={<CatalogPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/courses/:courseId" element={<CoursePage />} />
          <Route path="/share/:token" element={<SharePage />} />
          <Route
            path="/courses/:courseId/lessons/:lessonId"
            element={<ProtectedRoute><LessonPage /></ProtectedRoute>}
          />
          <Route path="/quizzes/:quizId" element={<ProtectedRoute><QuizPage /></ProtectedRoute>} />
          <Route path="/my-learning" element={<ProtectedRoute><MyLearningPage /></ProtectedRoute>} />
          <Route
            path="/educator"
            element={<ProtectedRoute role="EDUCATOR"><EducatorDashboard /></ProtectedRoute>}
          />
          <Route
            path="/educator/courses/:courseId"
            element={<ProtectedRoute role="EDUCATOR"><CourseEditorPage /></ProtectedRoute>}
          />
          <Route
            path="*"
            element={
              <EmptyState title="Page not found">
                <Link to="/" className="btn-primary">
                  Go home
                </Link>
              </EmptyState>
            }
          />
        </Routes>
      </main>
    </>
  );
}
