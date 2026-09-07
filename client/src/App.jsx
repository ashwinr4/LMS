import { BrowserRouter } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext.jsx';
import { SocketProvider } from './context/SocketContext.jsx';
import { AppRoutes } from './routes/AppRoutes.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <SocketProvider>
          <AppRoutes />
        </SocketProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

