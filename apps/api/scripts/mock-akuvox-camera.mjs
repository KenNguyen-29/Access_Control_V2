#!/usr/bin/env node

import http from 'node:http';
import { URL } from 'node:url';
import sharp from 'sharp';

function parseArgs(argv) {
  const values = {
    bind: '0.0.0.0',
    port: 19084,
    virtualIp: '192.168.1.4',
    username: '',
    password: '',
    fps: 5,
    width: 1280,
    height: 720,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const value = inlineValue ?? argv[i + 1];
    if (inlineValue == null && value && !value.startsWith('--')) i += 1;
    if (value == null || value.startsWith('--')) continue;
    if (['port', 'fps', 'width', 'height'].includes(key)) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) values[key] = parsed;
    } else if (key in values) {
      values[key] = value;
    }
  }
  values.port = Math.min(65535, Math.max(1, Math.round(values.port)));
  values.fps = Math.min(15, Math.max(1, Math.round(values.fps)));
  values.width = Math.min(1920, Math.max(320, Math.round(values.width)));
  values.height = Math.min(1080, Math.max(180, Math.round(values.height)));
  return values;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function frameSvg(options, frameNo) {
  const now = new Date();
  const timestamp = now.toLocaleString('vi-VN', { hour12: false });
  const cells = [];
  const columns = 32;
  const rows = 18;
  const cellWidth = options.width / columns;
  const cellHeight = options.height / rows;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const hue = (x * 13 + y * 19 + frameNo * 7) % 360;
      const opacity = 0.12 + ((x + y) % 5) * 0.025;
      cells.push(
        `<rect x="${x * cellWidth}" y="${y * cellHeight}" width="${cellWidth + 1}" height="${cellHeight + 1}" fill="hsl(${hue} 72% 48%)" opacity="${opacity.toFixed(2)}"/>`,
      );
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}">
    <defs>
      <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#073b4c"/>
        <stop offset="0.48" stop-color="#118b78"/>
        <stop offset="1" stop-color="#07131d"/>
      </linearGradient>
      <filter id="shadow"><feGaussianBlur stdDeviation="4"/></filter>
    </defs>
    <rect width="100%" height="100%" fill="url(#background)"/>
    ${cells.join('')}
    <rect x="38" y="34" width="${options.width - 76}" height="${options.height - 68}" rx="18" fill="#041019" opacity="0.42" stroke="#c8fff0" stroke-opacity="0.35" stroke-width="2"/>
    <circle cx="${options.width - 80}" cy="70" r="12" fill="#ef4444"/>
    <text x="64" y="110" fill="#ffffff" font-family="Segoe UI, Arial, sans-serif" font-size="42" font-weight="700">MOCK AKUVOX CAMERA</text>
    <text x="64" y="166" fill="#d6fff5" font-family="Consolas, monospace" font-size="30">IP ${escapeXml(options.virtualIp)} · RTSP TEST STREAM</text>
    <text x="64" y="${options.height - 100}" fill="#e2e8f0" font-family="Consolas, monospace" font-size="25">${escapeXml(timestamp)} · frame ${frameNo}</text>
    <text x="64" y="${options.height - 58}" fill="#a7f3d0" font-family="Segoe UI, Arial, sans-serif" font-size="22">Dùng để kiểm thử live view và snapshot lúc chấm công</text>
  </svg>`;
}

function basicAuthMatches(req, options) {
  if (!options.username && !options.password) return true;
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    return (
      separator >= 0 &&
      decoded.slice(0, separator) === options.username &&
      decoded.slice(separator + 1) === options.password
    );
  } catch {
    return false;
  }
}

function sendJson(res, statusCode, value) {
  const body = JSON.stringify(value);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sendJpeg(res, frame) {
  res.writeHead(200, {
    'content-type': 'image/jpeg',
    'cache-control': 'no-store, no-cache, must-revalidate',
    'content-length': frame.length,
  });
  res.end(frame);
}

function writeMjpegFrame(res, frame) {
  res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
  res.write(frame);
  res.write('\r\n');
}

const options = parseArgs(process.argv.slice(2));
const clients = new Set();
let frameNumber = 0;
let currentFrame = await sharp(Buffer.from(frameSvg(options, frameNumber))).jpeg({ quality: 86 }).toBuffer();

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (!basicAuthMatches(req, options)) {
    res.writeHead(401, { 'www-authenticate': 'Basic realm="Mock Akuvox Camera"' });
    res.end('Unauthorized');
    return;
  }

  if (url.pathname === '/health') {
    sendJson(res, 200, {
      ok: true,
      virtualIp: options.virtualIp,
      bind: options.bind,
      port: options.port,
      fps: options.fps,
      frameBytes: currentFrame.length,
    });
    return;
  }

  if (['/snapshot.jpg', '/jpeg.cgi', '/picture.jpg', '/snapshot.cgi'].includes(url.pathname)) {
    sendJpeg(res, currentFrame);
    return;
  }

  if (url.pathname === '/stream.mjpeg' || url.pathname === '/mjpeg') {
    res.writeHead(200, {
      'content-type': 'multipart/x-mixed-replace; boundary=frame',
      'cache-control': 'no-store, no-cache, must-revalidate',
      connection: 'keep-alive',
    });
    clients.add(res);
    res.on('close', () => clients.delete(res));
    writeMjpegFrame(res, currentFrame);
    return;
  }

  sendJson(res, 200, {
    ok: true,
    service: 'mock-akuvox-camera',
    virtualIp: options.virtualIp,
    endpoints: ['/health', '/snapshot.jpg', '/stream.mjpeg'],
  });
});

const frameTimer = setInterval(async () => {
  frameNumber += 1;
  try {
    currentFrame = await sharp(Buffer.from(frameSvg(options, frameNumber)))
      .jpeg({ quality: 86 })
      .toBuffer();
    for (const client of clients) {
      if (client.destroyed) {
        clients.delete(client);
        continue;
      }
      try {
        writeMjpegFrame(client, currentFrame);
      } catch {
        clients.delete(client);
      }
    }
  } catch (error) {
    console.error(`frame generation failed: ${error instanceof Error ? error.message : error}`);
  }
}, Math.round(1000 / options.fps));
frameTimer.unref?.();

function shutdown() {
  clearInterval(frameTimer);
  for (const client of clients) client.end();
  clients.clear();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref?.();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(options.port, options.bind, () => {
  console.log(`Mock camera ready: virtual IP ${options.virtualIp}`);
  console.log(`HTTP/MJPEG source: http://127.0.0.1:${options.port}/stream.mjpeg`);
  console.log(`Snapshot: http://127.0.0.1:${options.port}/snapshot.jpg (${currentFrame.length} bytes)`);
  console.log('Use MOCK_CAMERA_SOURCE=http://127.0.0.1:' + options.port + '/stream.mjpeg for native go2rtc.');
  console.log('For Docker Desktop go2rtc use host.docker.internal instead of 127.0.0.1.');
});
