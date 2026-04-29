import { createHash, randomBytes } from 'crypto';

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

export function parseDurationToSeconds(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value);

  if (!match) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const amount = Number(match[1]);
  const unit = match[2];

  switch (unit) {
    case 's':
      return amount;
    case 'm':
      return amount * 60;
    case 'h':
      return amount * 60 * 60;
    case 'd':
      return amount * 60 * 60 * 24;
    default:
      return amount;
  }
}

