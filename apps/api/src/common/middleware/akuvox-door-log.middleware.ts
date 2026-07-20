import { NextFunction, Request, Response } from 'express';

function isAkuvoxDoorLogPath(path: string): boolean {
  return (
    path.endsWith('/door_log') ||
    path.endsWith('/door_log/') ||
    path.includes('/akuvox/door_log')
  );
}

/** Akuvox panels may send non-standard Content-Type; force JSON parsing downstream. */
export function akuvoxDoorLogMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!isAkuvoxDoorLogPath(req.path)) {
    next();
    return;
  }

  res.setHeader('Connection', 'close');
  (req.headers as Record<string, string>)['content-type'] = 'application/json; charset=utf-8';
  next();
}
