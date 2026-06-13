import { ValidationPipe } from '@nestjs/common';
import { RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NextFunction, Request, Response, json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { CourseRuntimeService } from './modules/course-runtime/course-runtime.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);
  const requestBodyLimit = config.get<string>('REQUEST_BODY_LIMIT', '120mb');

  app.use(json({ limit: requestBodyLimit }));
  app.use(urlencoded({ extended: true, limit: requestBodyLimit }));
  const courseRuntimeService = app.get(CourseRuntimeService);
  const reservedRootPaths = new Set(['api', 'auth', 'sso', 'register', 'registration']);

  app.use((request: Request, response: Response, next: NextFunction) => {
    const segments = request.path.split('/').filter(Boolean);

    if (segments.length < 2 || reservedRootPaths.has(segments[0])) {
      next();
      return;
    }

    void courseRuntimeService
      .serveCoursewareRuntime(segments[0], segments[1], segments.slice(2).join('/'), request, response)
      .catch(next);
  });

  const corsOrigins = config
    .get<string>('CORS_ORIGINS', '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
  });

  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'sso/*path', method: RequestMethod.ALL },
      { path: 'register/*path', method: RequestMethod.ALL },
      { path: 'registration/*path', method: RequestMethod.ALL },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('智美教育新生态业务底座 API')
    .setDescription('智美教育新生态业务底座第一阶段 API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(config.get<string>('PORT', '3000'));
  await app.listen(port);
}

void bootstrap();
