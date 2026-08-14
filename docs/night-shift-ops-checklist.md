# Checklist vận hành ca đêm

Kiểm tra hệ thống trước/trong/sau ca đêm (Face + giám sát). Ghi người trực và kết quả.

| Mốc | Việc | Pass? | Ghi chú |
|-----|------|-------|--------|
| **21:50** | VPN site↔HQ ổn; API `:8080` reachable từ công trường; DNAKE poll không lỗi hàng loạt | | |
| **22:10** | Quét thử 1 user vào ca đêm → AccessLog + Attendance đúng; snapshot (nếu đã map camera) | | |
| **00:30** | Dashboard giám sát còn nhận sự kiện; Redis/BullMQ không backlog bất thường | | |
| **05:50** | Quét thử ra ca / giao ca; không double check-out do spam | | |
| **06:20** | Đối chiếu nhanh báo cáo ngày (khu vực + tên máy); escalate nếu mất log | | |

Escalation: mất webhook/poll > 10 phút → kiểm tra firewall VPN, IP panel, Action URL `deviceCode`.
