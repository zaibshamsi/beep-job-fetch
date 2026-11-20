import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Shell } from './components/shell/Shell.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';

// Routes load on demand so the landing page does not carry the map engine.
const LandingPage = lazy(() => import('./pages/LandingPage.tsx').then((m) => ({ default: m.LandingPage })));
const MapPage = lazy(() => import('./pages/MapPage.tsx').then((m) => ({ default: m.MapPage })));
const InsightsPage = lazy(() => import('./pages/InsightsPage.tsx').then((m) => ({ default: m.InsightsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage.tsx').then((m) => ({ default: m.SettingsPage })));
const ReviewPage = lazy(() => import('./pages/ReviewPage.tsx').then((m) => ({ default: m.ReviewPage })));

function JobRedirect() {
  const { id } = useParams();
  return <Navigate to={`/map?job=${id ?? ''}`} replace />;
}

function Loading() {
  return (
    <div role="status" aria-live="polite" style={{ padding: '120px 24px', color: 'var(--tx2)' }}>
      Loading…
    </div>
  );
}

export function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<LandingPage />} />
          <Route path="map" element={<MapPage />} />
          <Route path="insights" element={<InsightsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="review" element={<ReviewPage />} />
          <Route path="jobs/:id" element={<JobRedirect />} />
          <Route path="about" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
