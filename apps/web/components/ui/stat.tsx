import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Props = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  size?: 'md' | 'lg';
};

export function Stat({ label, value, detail, size = 'md', className, ...props }: Props) {
  return (
    <div {...props} className={cn('metric-card', className)}>
      <div className="fine-print">{label}</div>
      <div className={cn('mt-3 font-semibold text-white', size === 'lg' ? 'text-3xl' : 'text-2xl')}>
        {value}
      </div>
      {detail ? <p className="mt-2 text-sm text-slate-400">{detail}</p> : null}
    </div>
  );
}
