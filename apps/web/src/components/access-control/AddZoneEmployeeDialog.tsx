'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Dialog } from '@/components/ui/dialog';
import { queryKeys } from '@/lib/queryKeys';
import {
  ApiError,
  createUser,
  enrollFace,
  getDepartments,
  provisionUser,
  type Department,
} from '@/lib/api';
import {
  hasFormErrors,
  validateUserForm,
  type UserFormFieldErrors,
} from '@/lib/formValidation';
import { FieldError, RequiredMark } from '@/components/ui/field-error';
import { cn } from '@/lib/utils';

const EMPTY_FORM = {
  fullName: '',
  email: '',
  phone: '',
  departmentId: '',
  faceImageFile: null as File | null,
  facePreviewUrl: '',
};

async function compressImageFile(file: File, maxEdge = 1024, quality = 0.85): Promise<File> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = dataUrl;
    });
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new File([file], 'face.jpg', { type: 'image/jpeg' });
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Không nén được ảnh'))),
        'image/jpeg',
        quality,
      );
    });
    return new File([blob], 'face.jpg', { type: 'image/jpeg' });
  } catch {
    return new File([file], 'face.jpg', { type: 'image/jpeg' });
  }
}

function revokePreviewUrl(url: string) {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url);
}

type Props = {
  open: boolean;
  zoneId: string;
  zoneName: string;
  onClose: () => void;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
};

export function AddZoneEmployeeDialog({
  open,
  zoneId,
  zoneName,
  onClose,
  onSuccess,
  onError,
}: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<UserFormFieldErrors>({});
  const [localError, setLocalError] = useState<string | null>(null);

  const departmentsQuery = useQuery({
    queryKey: queryKeys.departments(),
    queryFn: () => getDepartments(),
    enabled: open,
  });
  const departments: Department[] = departmentsQuery.data ?? [];

  useEffect(() => {
    if (!open) {
      setForm((prev) => {
        revokePreviewUrl(prev.facePreviewUrl);
        return EMPTY_FORM;
      });
      setFieldErrors({});
      setLocalError(null);
    }
  }, [open]);

  useEffect(() => {
    return () => revokePreviewUrl(form.facePreviewUrl);
  }, [form.facePreviewUrl]);

  async function onPickFace(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const jpegFile = await compressImageFile(file);
      setForm((prev) => {
        revokePreviewUrl(prev.facePreviewUrl);
        return {
          ...prev,
          faceImageFile: jpegFile,
          facePreviewUrl: URL.createObjectURL(jpegFile),
        };
      });
    } catch {
      setLocalError('Không đọc được ảnh đã chọn');
    }
    e.target.value = '';
  }

  function patchForm(patch: Partial<typeof EMPTY_FORM>) {
    setForm((prev) => ({ ...prev, ...patch }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(patch) as (keyof UserFormFieldErrors)[]) {
        if (key in next) delete next[key];
      }
      return next;
    });
  }

  function clearFaceImage() {
    setForm((prev) => {
      revokePreviewUrl(prev.facePreviewUrl);
      return { ...prev, faceImageFile: null, facePreviewUrl: '' };
    });
  }

  function onSave() {
    const errors = validateUserForm(form);
    setFieldErrors(errors);
    if (hasFormErrors(errors)) {
      setLocalError('Vui lòng kiểm tra lại thông tin đã nhập');
      return;
    }
    setLocalError(null);
    saveMutation.mutate();
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const errors = validateUserForm(form);
      if (hasFormErrors(errors)) {
        throw new ApiError('Vui lòng kiểm tra lại thông tin đã nhập', 400);
      }
      const payload = {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        departmentId: form.departmentId || undefined,
      };
      const saved = await createUser(payload);
      if (form.faceImageFile) {
        await enrollFace(saved.id, form.faceImageFile);
      }
      const provision = await provisionUser(saved.id, {
        zoneIds: [zoneId],
        autoSync: Boolean(form.faceImageFile),
      });
      return { saved, provision };
    },
    onSuccess: ({ saved, provision }) => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      void queryClient.invalidateQueries({ queryKey: ['permissions'] });
      void queryClient.invalidateQueries({ queryKey: ['accessControl'] });
      const zoneResult = provision.syncByZone[0];
      const zoneLabel = zoneResult?.zoneName ?? zoneName;
      const hasRealSuccess = zoneResult?.results?.some((r) => r.ok) && !zoneResult?.mock;
      const failureText =
        zoneResult?.results
          ?.filter((r) => !r.ok)
          .map((r) => r.error || r.deviceName)
          .join(' | ') ?? '';
      if (zoneResult?.mock) {
        onSuccess?.(`Đã thêm nhân viên ${saved.employeeCode} · Đang ở mock mode nên chưa gửi thật lên thiết bị`);
      } else if (form.faceImageFile && provision.autoSync && hasRealSuccess) {
        onSuccess?.(`Đã thêm nhân viên ${saved.employeeCode} · Đã đẩy FaceID lên ${zoneLabel}`);
        if (failureText) onError?.(failureText);
      } else if (form.faceImageFile && provision.autoSync) {
        onSuccess?.(`Đã thêm nhân viên ${saved.employeeCode}`);
        onError?.(failureText || `Chưa đồng bộ được thiết bị tại ${zoneLabel}`);
      } else {
        onSuccess?.(`Đã thêm nhân viên ${saved.employeeCode} vào khu vực ${zoneName}`);
        if (failureText) onError?.(failureText);
      }
      onClose();
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : 'Lưu thất bại';
      setLocalError(msg);
      onError?.(msg);
    },
  });

  const saving = saveMutation.isPending;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Thêm nhân viên — ${zoneName}`}
      description="Tạo nhân viên mới và gán quyền vào khu vực này. Có ảnh mặt sẽ tự đồng bộ FaceID xuống Akuvox."
      className="max-w-lg"
    >
      <div className="space-y-3">
        {localError && <p className="text-xs text-destructive">{localError}</p>}
        <div className="flex items-start gap-4">
          <div className="relative flex h-28 w-24 shrink-0 items-center justify-center overflow-hidden rounded-sm border-2 border-dashed border-border bg-muted/30">
            {form.facePreviewUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.facePreviewUrl} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  className="absolute right-1 top-1 rounded-full bg-black/50 p-0.5 text-white"
                  onClick={clearFaceImage}
                  title="Xóa ảnh"
                >
                  <X className="h-3 w-3" />
                </button>
              </>
            ) : (
              <span className="text-3xl font-semibold text-muted-foreground/40">
                {(form.fullName.trim()[0] || '?').toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-muted-foreground">Ảnh khuôn mặt (FaceID)</label>
            <input
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              className="w-full text-xs"
              onChange={(e) => void onPickFace(e)}
            />
          </div>
        </div>
        <div className="rounded-sm border border-dashed border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
          Mã nhân viên sẽ được tự sinh sau khi lưu theo dạng <span className="font-mono">NV-0001</span>.
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            Họ tên
            <RequiredMark />
          </label>
          <Input
            placeholder="Nguyễn Văn A"
            className={cn('input-design h-10', fieldErrors.fullName && 'border-destructive')}
            value={form.fullName}
            onChange={(e) => patchForm({ fullName: e.target.value })}
            aria-invalid={Boolean(fieldErrors.fullName)}
          />
          <FieldError message={fieldErrors.fullName} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Email
              <RequiredMark />
            </label>
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="email@example.com"
              className={cn('input-design h-10', fieldErrors.email && 'border-destructive')}
              value={form.email}
              onChange={(e) => patchForm({ email: e.target.value })}
              aria-invalid={Boolean(fieldErrors.email)}
            />
            <FieldError message={fieldErrors.email} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Số điện thoại
              <RequiredMark />
            </label>
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0912345678"
              className={cn('input-design h-10', fieldErrors.phone && 'border-destructive')}
              value={form.phone}
              onChange={(e) => patchForm({ phone: e.target.value })}
              aria-invalid={Boolean(fieldErrors.phone)}
            />
            <FieldError message={fieldErrors.phone} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Phòng ban</label>
          <Select
            value={form.departmentId}
            onChange={(e) => patchForm({ departmentId: e.target.value })}
          >
            <option value="">— Chọn phòng ban —</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Hủy
          </Button>
          <Button variant="accent" size="sm" disabled={saving} onClick={() => onSave()}>
            {saving ? 'Đang lưu...' : 'Thêm & đồng bộ'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
