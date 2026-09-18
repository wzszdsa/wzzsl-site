import OpenAI from 'openai';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { validateGenerateImageRequest, type ErrorResponse, type GenerateImageResponse } from '../../../lib/image-contract';

export const runtime = 'nodejs';

const requestWindowMs = 10 * 60 * 1000;
const maxRequestsPerWindow = 5;
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function getClientKey(request: Request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local-client';
}

function isRateLimited(key: string) {
  const now = Date.now();
  const current = requestCounts.get(key);
  if (!current || current.resetAt <= now) {
    requestCounts.set(key, { count: 1, resetAt: now + requestWindowMs });
    return false;
  }
  current.count += 1;
  return current.count > maxRequestsPerWindow;
}

function errorResponse(message: string, status: number) {
  return NextResponse.json<ErrorResponse>({ error: message }, { status });
}

function getUpstreamStatus(error: unknown) {
  return error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : 0;
}

export async function POST(request: Request) {
  const adminToken = process.env.AI_IMAGE_ADMIN_TOKEN;
  const suppliedToken = request.headers.get('x-ai-image-token');
  const productionNeedsToken = process.env.NODE_ENV === 'production';

  if (productionNeedsToken && !adminToken) return errorResponse('生产环境未配置 AI_IMAGE_ADMIN_TOKEN', 503);
  if (adminToken && suppliedToken !== adminToken) return errorResponse('需要有效的 AI 绘图访问令牌', 401);
  if (isRateLimited(getClientKey(request))) return errorResponse('请求过于频繁，请稍后再试', 429);

  let input;
  try {
    input = validateGenerateImageRequest(await request.json());
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : '请求 JSON 格式无效', 400);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return errorResponse('服务端未配置 OPENAI_API_KEY', 503);

  let base64: string | undefined;
  try {
    const client = new OpenAI({ apiKey });
    const result = await client.images.generate({
      model: 'gpt-image-2',
      prompt: input.prompt,
      size: '1536x1024',
      quality: 'medium',
      output_format: 'png'
    });
    base64 = result.data?.[0]?.b64_json;
  } catch (error) {
    const upstreamStatus = getUpstreamStatus(error);
    console.error('Image generation failed', error);
    return errorResponse(upstreamStatus === 429 ? '图像服务请求过于频繁，请稍后再试' : '图像服务暂时不可用，请稍后再试', upstreamStatus === 429 ? 429 : 502);
  }

  if (!base64) {
    console.error('Image API returned no image payload');
    return errorResponse('图像生成服务没有返回可用图片', 502);
  }

  const filename = 'generated-' + input.slot + '.png';
  try {
    const outputPath = path.join(process.cwd(), 'public', 'assets', filename);
    await fs.writeFile(outputPath, Buffer.from(base64, 'base64'));
  } catch (error) {
    console.error('Generated image could not be saved', error);
    return errorResponse('图片保存失败，请稍后再试', 500);
  }

  return NextResponse.json<GenerateImageResponse>({
    url: '/assets/' + filename + '?t=' + Date.now(),
    slot: input.slot
  });
}
