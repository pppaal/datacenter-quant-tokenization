'use client';

import { Button } from '@/components/ui/button';

export function AdminSsoButton() {
  function handleClick() {
    const query = typeof window !== 'undefined' ? window.location.search : '';
    window.location.href = query ? `/api/admin/sso/login${query}` : '/api/admin/sso/login';
  }

  return (
    <Button type="button" variant="secondary" onClick={handleClick}>
      Continue With SSO
    </Button>
  );
}
