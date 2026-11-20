// Dev-only entry for harness.html. Never imported by the app.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../styles/app.css';
import { MapHarness } from './MapHarness.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MapHarness />
  </StrictMode>,
);
