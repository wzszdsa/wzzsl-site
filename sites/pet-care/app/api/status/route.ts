import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export function GET() {
  return NextResponse.json({
    configured: Boolean(process.env.OPENAI_API_KEY),
    authRequired: process.env.NODE_ENV === 'production' || Boolean(process.env.AI_IMAGE_ADMIN_TOKEN),
    model: 'gpt-image-2' as const
  });
}
