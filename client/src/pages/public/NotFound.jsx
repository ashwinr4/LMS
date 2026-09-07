import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button.jsx';
import { ShieldAlert, Home, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center py-12 text-center">
      <div className="max-w-md space-y-6">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-4xl font-extrabold text-app tracking-tight">404</h1>
          <h2 className="text-xl font-bold text-app">Page or Resource Not Found</h2>
          <p className="text-xs sm:text-sm text-app-secondary">
            The requested platform endpoint or learning resource does not exist or requires higher authorization privileges.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link to="/">
            <Button leftIcon={<Home className="h-4 w-4" />}>
              Return to Platform Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
