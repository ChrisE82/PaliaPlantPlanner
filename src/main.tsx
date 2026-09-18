import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App';
import { AppDndProvider } from './ui/dnd/AppDnd';
import { PlannerClientProvider } from './ui/state/plannerClient';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PlannerClientProvider>
      <AppDndProvider>
        <App />
      </AppDndProvider>
    </PlannerClientProvider>
  </StrictMode>,
);
