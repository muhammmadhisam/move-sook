'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@movesook/ui';
import { AdminLoginInput } from '@movesook/shared';
import { api } from '@/lib/api';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const login = useMutation({
    mutationFn: async () => {
      const parsed = AdminLoginInput.safeParse({ email, password });
      if (!parsed.success) throw new Error('กรุณากรอกอีเมลและรหัสผ่านให้ถูกต้อง');
      const res = await api.auth.admin.login.$post({ json: parsed.data });
      if (res.status === 429) throw new Error('พยายามมากเกินไป กรุณารอสักครู่');
      if (!res.ok) throw new Error('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      return res.json();
    },
    onSuccess: () => router.replace('/'),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>MoveSook Admin</CardTitle>
          <CardDescription>เข้าสู่ระบบผู้ดูแล</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">อีเมล</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">รหัสผ่าน</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && login.mutate()}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button disabled={login.isPending} onClick={() => login.mutate()}>
            {login.isPending ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
