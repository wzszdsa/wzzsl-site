import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from '../app/api/generate-image/route';
import { GET } from '../app/api/status/route';

const validRequest = { slot: 'reception', prompt: 'a premium pet salon reception area' };

afterEach(() => vi.unstubAllEnvs());

describe('image API routes', () => {
  it('reports configuration without exposing the API key', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('AI_IMAGE_ADMIN_TOKEN', '');
    const response = GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ configured: false, model: 'gpt-image-2', authRequired: false });
    expect(body).not.toHaveProperty('apiKey');
  });

  it('rejects an invalid payload before calling the image service', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const response = await POST(new Request('http://localhost/api/generate-image', {
      method: 'POST',
      body: JSON.stringify({ slot: 'lobby', prompt: validRequest.prompt }),
      headers: { 'content-type': 'application/json' }
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: '无效的轮播区域' });
  });

  it('requires the admin token when token protection is enabled', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('AI_IMAGE_ADMIN_TOKEN', 'secret');
    const response = await POST(new Request('http://localhost/api/generate-image', {
      method: 'POST',
      body: JSON.stringify(validRequest),
      headers: { 'content-type': 'application/json' }
    }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: '需要有效的 AI 绘图访问令牌' });
  });

  it('returns a service configuration error when no API key is present', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('AI_IMAGE_ADMIN_TOKEN', '');
    const response = await POST(new Request('http://localhost/api/generate-image', {
      method: 'POST',
      body: JSON.stringify(validRequest),
      headers: { 'content-type': 'application/json', 'x-forwarded-for': 'test-client' }
    }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: '服务端未配置 OPENAI_API_KEY' });
  });
});
