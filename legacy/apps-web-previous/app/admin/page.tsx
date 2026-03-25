'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('admin1234');
  const [error, setError] = useState('');

  return (
    <main className="mx-auto w-[min(420px,92vw)] py-16">
      <h1 className="mb-4 text-2xl font-semibold">Admin Login</h1>
      <p className="mb-4 text-sm text-slate-400">관리자 전용입니다.</p>
      <form
        className="grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const res = await signIn('credentials', { email, password, redirect: false, callbackUrl: '/admin/assets' });
          if (res?.ok) window.location.href = '/admin/assets';
          else setError('로그인 실패');
        }}
      >
        <Input value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <Button type="submit">로그인</Button>
      </form>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </main>
  );
}
