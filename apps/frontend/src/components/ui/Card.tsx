'use client';

import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  description?: string;
  footer?: React.ReactNode;
}

export function Card({ children, className, title, description, footer }: CardProps) {
  return (
    <div className={cn('rounded-xl border border-border bg-card', className)}>
      {(title || description) && (
        <div className="px-6 py-4 border-b border-border">
          {title && <h3 className="text-lg font-semibold">{title}</h3>}
          {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
        </div>
      )}
      <div className="p-6">{children}</div>
      {footer && (
        <div className="px-6 py-4 border-t border-border">{footer}</div>
      )}
    </div>
  );
}
