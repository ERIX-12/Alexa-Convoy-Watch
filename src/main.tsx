import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { APIProvider } from '@vis.gl/react-google-maps';

createRoot(document.getElementById('root')!).render(
  <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY} libraries={['routes', 'visualization']}>
    <App />
  </APIProvider>
);
