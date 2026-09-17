import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App';
import { PlannerClientProvider } from './ui/state/plannerClient';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlannerClientProvider>
      <App />
    </PlannerClientProvider>
  </StrictMode>,
);
