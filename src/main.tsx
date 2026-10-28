import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
// Stylesheets in cascade order: later files may override earlier ones.
import './styles/tokens.css';
import './styles/base.css';
import './styles/controls.css';
import './styles/header.css';
import './styles/toolbar.css';
import './styles/table.css';
import './styles/popovers.css';
import './styles/markdown.css';
import './styles/settings.css';
import './styles/legend.css';

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
