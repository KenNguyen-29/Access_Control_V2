# Checklist test 12 làn / NAT / DNAKE (Sprint 2)

Chạy trên staging hoặc VPN trước khi bàn giao. Ghi kết quả ngắn vào bảng cuối.

## Chuẩn bị

- [ ] ≥12 máy panel (Akuvox và/hoặc DNAKE) gắn đủ zone, mỗi máy có `code` duy nhất
- [ ] ≥12 user có Face + đúng 1 khu vực permission (khớp máy sẽ quét)
- [ ] Camera map (nếu kiểm tra snapshot) cho vài máy
- [ ] `AKUVOX_MOCK_MODE=false`, DNAKE poll bật, Redis/BullMQ chạy
- [ ] Action URL Akuvox kèm `deviceCode` (hoặc `mac`/`device`) khi 2 máy cùng NAT

## 1. Đồng thời 12 làn

1. Quét 12 user × 12 máy trong cùng ~1 giây (hoặc script webhook đồng thời).
2. Kỳ vọng: 12 `AccessLog` với đúng `deviceId` / `zoneId`; không mất job; không gán nhầm máy.

Kết quả: _pass / fail — ghi chú_

## 2. Một user hai cổng trong 5 phút

1. User có quyền zone A; quét cổng A rồi cổng B (zone khác) trong cooldown giám sát.
2. Kỳ vọng: 2 log giám sát; cổng B `isValid=false`, không tạo/đổi `AttendanceRecord`.

Kết quả: _pass / fail — ghi chú_

## 3. Hai Akuvox cùng NAT IP

1. Hai panel cùng `clientIp` NAT; webhook/door_log có `deviceCode` khác nhau.
2. Kỳ vọng: không ghi nhầm khu; create device từ chối trùng `ipAddress` giữa 2 Akuvox nếu cố tình cấu hình trùng.

Kết quả: _pass / fail — ghi chú_

## 4. DNAKE — một máy timeout

1. 6 DNAKE; tắt/firewall một máy (timeout HTTP).
2. Kỳ vọng: poll `Promise.allSettled` — máy lỗi không chặn máy khác; `lastUnlockTs` chỉ advance máy poll thành công; log unlock các máy còn lại vẫn ingest.

Kết quả: _pass / fail — ghi chú_ (đo trễ poll nếu cần)

## Ghi chú kỹ thuật đã ship

- BullMQ `@Processor(AKUVOX_QUEUE, { concurrency: 8 })`
- Door log: ưu tiên `deviceCode` query; IP chỉ fallback
- `processPunch`: `pg_advisory_xact_lock` theo `userId` + workDate
- DNAKE poll song song theo máy
