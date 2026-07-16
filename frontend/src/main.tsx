/**
 * @file main.tsx
 * @description Frontend entry point. Mounts the React application into the DOM inside StrictMode.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '../public/style.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
