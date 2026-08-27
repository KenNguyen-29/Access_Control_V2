import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded, NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { akuvoxDoorLogMiddleware } from './common/middleware/akuvox-door-log.middleware';
import { resolveCorsOrigin } from './common/utils/network.util';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('API_PORT', 8010);
  const bindHost = configService.get<string>('API_BIND_HOST', '0.0.0.0').trim() || '0.0.0.0';
  const corsOrigin = resolveCorsOrigin(configService.get<string>('CORS_ORIGIN', ''));
  const bodyLimit = configService.get<string>('JSON_BODY_LIMIT', '15mb');

  app.use(akuvoxDoorLogMiddleware);
  app.use(
    json({
      limit: bodyLimit,
      verify: (req, _res, buf) => {
        const path = (req as Request).url || '';
        if (path.includes('door_log')) {
          (req as Request & { rawBody?: Buffer }).rawBody = buf;
        }
      },
    }),
  );
  app.use(urlencoded({ extended: true, limit: bodyLimit }));

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  // Security headers (API)
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    );
    res.removeHeader('X-Powered-By');
    if (configService.get<string>('ENABLE_HSTS') === 'true') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    // CSP report-only for API JSON responses is low-value; set a restrictive baseline for docs UI
    if ((req.url || '').includes('/docs')) {
      res.setHeader(
        'Content-Security-Policy-Report-Only',
        "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'",
      );
    }
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Access Control V2 API')
    .setDescription('FaceID & CCTV Access Control System')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(port, bindHost);
  console.log(`API listening on ${bindHost}:${port}`);
  console.log(`Swagger docs at http://${bindHost}:${port}/api/docs`);
}

bootstrap();
