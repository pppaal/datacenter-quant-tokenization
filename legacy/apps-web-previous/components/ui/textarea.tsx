import { TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn('w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm', props.className)} />;
}
