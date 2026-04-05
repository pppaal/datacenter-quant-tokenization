'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function AdminSessionButton() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSignOut() {
    setIsSubmitting(true);

    try {
      await fetch('/api/admin/session', {
        method: 'DELETE'
      });
    } finally {
      router.push('/admin/login');
      router.refresh();
      setIsSubmitting(false);
    }
  }

  return (
    <Button type="button" variant="secondary" onClick={handleSignOut} disabled={isSubmitting}>
      {isSubmitting ? 'Ending Session...' : 'End Session'}
    </Button>
  );
}
