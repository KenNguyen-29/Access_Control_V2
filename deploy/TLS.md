# TLS / HTTPS (production)

## Goal
- Terminate TLS at a reverse proxy (Caddy / Nginx / Traefik).
- Redirect all HTTP → HTTPS.
- Enable HSTS only after HTTPS is confirmed working (`ENABLE_HSTS=true`).

## Minimal Caddy example
```
acv2.example.local {
  encode gzip
  reverse_proxy web:3000
}

api.acv2.example.local {
  encode gzip
  reverse_proxy api:8080
}
```

Caddy auto-redirects HTTP→HTTPS when certificates are issued.

## Minimal Nginx snippet
```
server {
  listen 80;
  server_name acv2.example.local;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name acv2.example.local;
  ssl_certificate     /etc/ssl/certs/acv2.crt;
  ssl_certificate_key /etc/ssl/private/acv2.key;
  # After TLS is stable:
  # add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  location / {
    proxy_pass http://web:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
  }
}
```

## App env
- `COOKIE_SECURE=true` when serving over HTTPS (refresh cookie).
- `ENABLE_HSTS=true` only after browsers can reach HTTPS reliably.
- `CORS_ORIGIN=https://acv2.example.local`
- `NEXT_PUBLIC_API_URL=https://api.acv2.example.local/api`
