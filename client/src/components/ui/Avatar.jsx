import { useState } from 'react';
import { cn } from '../../utils/cn.js';
import { DefaultAvatar } from './DefaultAvatar.jsx';

export function Avatar({ src, name, size = 'md', className, status }) {
  const [imgError, setImgError] = useState(false);

  const sizeMap = {
    sm: 'h-7 w-7 text-xs',
    md: 'h-9 w-9 text-sm',
    lg: 'h-12 w-12 text-base font-semibold',
    xl: 'h-16 w-16 text-lg font-bold',
  };

  const statusMap = {
    online: 'bg-emerald-500',
    offline: 'bg-gray-400',
    busy: 'bg-red-500',
    away: 'bg-amber-500',
  };

  const showImage = src && !imgError;

  return (
    <div className="relative inline-block shrink-0">
      {showImage ? (
        <img
          src={src}
          alt={name || 'Avatar'}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className={cn(
            'rounded-full object-cover border border-app shadow-sm',
            sizeMap[size] || sizeMap.md,
            className
          )}
        />
      ) : (
        <DefaultAvatar
          size={size}
          className={cn('shadow-xs', className)}
        />
      )}

      {status && (
        <span
          className={cn(
            'absolute bottom-0 right-0 rounded-full border-2 border-surface dark:border-dark-surface',
            statusMap[status] || 'bg-emerald-500',
            size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5'
          )}
        />
      )}
    </div>
  );
}
