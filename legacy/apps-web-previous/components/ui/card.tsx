import { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Card(props: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn('rounded-xl border border-slate-800 bg-panel p-5', props.className)} />;
}
