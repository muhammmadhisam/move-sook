'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
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
import { AdminLoginInput, SetupInput } from '@movesook/shared';
import { api } from '@/lib/api';

export default function AdminLoginPage() {
  // Probe whether any admin exists.
  const setup = useQuery({
    queryKey: ['auth-setup'],
    queryFn: async () => {
      const res = await api.auth.setup.$get();
      if (!res.ok) throw new Error('ไม่สามารถตรวจสอบสถานะระบบได้');
      return res.json();
    },
    retry: 2,
    staleTime: Infinity,
  });

  if (setup.isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">กำลังโหลด…</p>
      </main>
    );
  }

  if (setup.data?.needsSetup) {
    return <SetupForm onDone={() => setup.refetch()} />;
  }

  return <LoginForm />;
}

// ─── First-run setup form ────────────────────────────────────────────────────

function SetupForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      if (password !== confirm) throw new Error('รหัสผ่านไม่ตรงกัน');
      const parsed = SetupInput.safeParse({ email, displayName, password });
      if (!parsed.success) {
        const msg = parsed.error.errors[0]?.message ?? 'ข้อมูลไม่ถูกต้อง';
        throw new Error(msg);
      }
      const res = await api.auth.setup.$post({ json: parsed.data });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg = (body as { error?: string } | null)?.error;
        throw new Error(msg === 'Admin already exists' ? 'มีแอดมินอยู่แล้วในระบบ' : 'ไม่สามารถสร้างบัญชีได้ กรุณาลองใหม่');
      }
    },
    onSuccess: () => {
      onDone();
      router.replace('/login');
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>ตั้งค่าระบบครั้งแรก</CardTitle>
          <CardDescription>สร้างบัญชีผู้ดูแลระบบแรก (Super Admin)</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="s-name">ชื่อผู้ดูแล</Label>
            <Input
              id="s-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="เช่น Admin MoveSook"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="s-email">อีเมล</Label>
            <Input
              id="s-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="s-pw">รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)</Label>
            <Input
              id="s-pw"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="s-pw2">ยืนยันรหัสผ่าน</Label>
            <Input
              id="s-pw2"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create.mutate()}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button disabled={create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'กำลังสร้างบัญชี…' : 'สร้างบัญชีผู้ดูแล'}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

// ─── Normal login form ───────────────────────────────────────────────────────

function LoginForm() {
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
