'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  useConfirm,
} from '@movesook/ui';
import {
  LEDGER_CATEGORY_PRESETS,
  LEDGER_ENTRY_TYPE_LABEL,
  LedgerEntryTypeSchema,
  type LedgerEntryDto,
  type LedgerEntryType,
} from '@movesook/shared';
import { api } from '@/lib/api';
import { AttachmentUpload, type Attachment } from '@/components/attachment-upload';

/** Today as YYYY-MM-DD for the date input default. */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function LedgerForm({ entry }: { entry?: LedgerEntryDto }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const isEdit = !!entry;

  const [type, setType] = useState<LedgerEntryType>(entry?.type ?? 'EXPENSE');
  const [category, setCategory] = useState(entry?.category ?? '');
  const [title, setTitle] = useState(entry?.title ?? '');
  const [amount, setAmount] = useState(entry ? String(entry.amount) : '');
  const [occurredAt, setOccurredAt] = useState(
    entry ? entry.occurredAt.slice(0, 10) : todayStr(),
  );
  const [note, setNote] = useState(entry?.note ?? '');
  const [attachments, setAttachments] = useState<Attachment[]>(
    entry?.attachments.map((a) => ({ url: a.url, name: a.name, mimeType: a.mimeType })) ?? [],
  );
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        type,
        category: category.trim(),
        title: title.trim(),
        amount: Number(amount),
        note: note.trim() ? note.trim() : null,
        occurredAt: new Date(`${occurredAt}T00:00:00`).toISOString(),
        attachments,
      };
      const res = isEdit
        ? await api.admin.ledger[':id'].$patch({ param: { id: entry!.id }, json: payload })
        : await api.admin.ledger.$post({ json: payload });
      if (!res.ok) {
        const b = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(b?.error ?? 'บันทึกไม่สำเร็จ');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'ledger'] });
      router.push('/ledger');
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const res = await api.admin.ledger[':id'].$delete({ param: { id: entry!.id } });
      if (!res.ok) throw new Error('ลบไม่สำเร็จ');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'ledger'] });
      router.push('/ledger');
    },
    onError: (e: Error) => setError(e.message),
  });

  const onSave = () => {
    setError(null);
    if (title.trim().length < 1) return setError('กรอกรายละเอียดรายการ');
    if (category.trim().length < 1) return setError('เลือกหรือกรอกหมวดหมู่');
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt <= 0) return setError('จำนวนเงินต้องเป็นจำนวนเต็มมากกว่า 0');
    if (!occurredAt) return setError('เลือกวันที่');
    save.mutate();
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: 'ลบรายการนี้?',
      description: 'การลบไม่สามารถย้อนกลับได้',
      confirmText: 'ลบ',
      destructive: true,
    });
    if (ok) remove.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{isEdit ? 'แก้ไขรายการบัญชี' : 'เพิ่มรายการบัญชี'}</h1>
        <div className="flex items-center gap-2">
          {isEdit && (
            <Button
              variant="outline"
              className="text-destructive"
              disabled={remove.isPending}
              onClick={onDelete}
            >
              ลบรายการ
            </Button>
          )}
          <Button variant="outline" onClick={() => router.push('/ledger')} disabled={save.isPending}>
            ยกเลิก
          </Button>
          <Button onClick={onSave} disabled={save.isPending}>
            {save.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>รายละเอียด</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>ประเภท *</Label>
                  <Select
                    value={type}
                    onValueChange={(v) => {
                      setType(v as LedgerEntryType);
                      setCategory(''); // presets differ per type
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LedgerEntryTypeSchema.options.map((t) => (
                        <SelectItem key={t} value={t}>
                          {LEDGER_ENTRY_TYPE_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="amount">จำนวนเงิน (บาท) *</Label>
                  <Input
                    id="amount"
                    type="number"
                    min={1}
                    step={1}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="title">รายการ *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={type === 'INCOME' ? 'เช่น ค่าบริการขนส่งงาน #1234' : 'เช่น เติมน้ำมันรถกระบะ'}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="category">หมวดหมู่ *</Label>
                  <Input
                    id="category"
                    list="ledger-categories"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="เลือกหรือพิมพ์เอง"
                  />
                  <datalist id="ledger-categories">
                    {LEDGER_CATEGORY_PRESETS[type].map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="occurredAt">วันที่ *</Label>
                  <Input
                    id="occurredAt"
                    type="date"
                    value={occurredAt}
                    onChange={(e) => setOccurredAt(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="note">หมายเหตุ</Label>
                <Textarea
                  id="note"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>รูป / เอกสารแนบ</CardTitle>
            </CardHeader>
            <CardContent>
              <AttachmentUpload value={attachments} onChange={setAttachments} />
            </CardContent>
          </Card>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
