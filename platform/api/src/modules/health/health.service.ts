import { connect as connectTcp, Socket } from 'node:net';
import { connect as connectTls, TLSSocket } from 'node:tls';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

type CheckState = {
  status: 'up' | 'down';
  latencyMs: number;
};

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async check() {
    const [database, redis] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);
    const status = database.status === 'up' && redis.status === 'up' ? 'ok' : 'degraded';

    return {
      status,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      checks: { database, redis },
    };
  }

  private async checkDatabase(): Promise<CheckState> {
    const startedAt = Date.now();
    try {
      await this.withTimeout(this.prisma.$queryRaw`SELECT 1`, 1500);
      return { status: 'up', latencyMs: Date.now() - startedAt };
    } catch {
      return { status: 'down', latencyMs: Date.now() - startedAt };
    }
  }

  private async checkRedis(): Promise<CheckState> {
    const startedAt = Date.now();
    try {
      const redisUrl = this.config.get<string>('REDIS_URL');
      if (!redisUrl) throw new Error('REDIS_URL is not configured');
      await this.pingRedis(new URL(redisUrl));
      return { status: 'up', latencyMs: Date.now() - startedAt };
    } catch {
      return { status: 'down', latencyMs: Date.now() - startedAt };
    }
  }

  private pingRedis(redisUrl: URL): Promise<void> {
    return new Promise((resolve, reject) => {
      const port = Number(redisUrl.port || (redisUrl.protocol === 'rediss:' ? 6380 : 6379));
      const onConnect = () => {
        const commands: string[][] = [];
        const username = decodeURIComponent(redisUrl.username);
        const password = decodeURIComponent(redisUrl.password);
        if (password) commands.push(username ? ['AUTH', username, password] : ['AUTH', password]);
        const database = redisUrl.pathname.replace(/^\//, '');
        if (database && database !== '0') commands.push(['SELECT', database]);
        commands.push(['PING']);
        socket.write(commands.map((command) => this.redisCommand(command)).join(''));
      };
      const socket: Socket | TLSSocket = redisUrl.protocol === 'rediss:'
        ? connectTls({ host: redisUrl.hostname, port, servername: redisUrl.hostname }, onConnect)
        : connectTcp({ host: redisUrl.hostname, port }, onConnect);
      let response = '';

      const finish = (error?: Error) => {
        socket.destroy();
        if (error) reject(error);
        else resolve();
      };

      socket.setTimeout(1500);
      socket.on('data', (chunk) => {
        response += chunk.toString('utf8');
        if (response.includes('-ERR') || response.includes('-NOAUTH') || response.includes('-WRONGPASS')) {
          finish(new Error('Redis rejected health check'));
        } else if (response.includes('+PONG')) {
          finish();
        }
      });
      socket.on('timeout', () => finish(new Error('Redis health check timed out')));
      socket.on('error', (error) => finish(error));
      socket.on('end', () => {
        if (!response.includes('+PONG')) finish(new Error('Redis closed before PONG'));
      });
    });
  }

  private redisCommand(parts: string[]) {
    return `*${parts.length}\r\n${parts.map((part) => `$${Buffer.byteLength(part)}\r\n${part}\r\n`).join('')}`;
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Health check timed out')), timeoutMs);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
