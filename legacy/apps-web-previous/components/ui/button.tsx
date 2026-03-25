import { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className={cn('rounded-md bg-accent px-4 py-2 text-white disabled:opacity-60', props.className)} />;
}
