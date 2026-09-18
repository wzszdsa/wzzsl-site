export const imageSlots = ['reception', 'wash', 'care'] as const;

export type ImageSlot = (typeof imageSlots)[number];

export type GenerateImageRequest = {
  slot: ImageSlot;
  prompt: string;
};

export type GenerateImageResponse = {
  url: string;
  slot: ImageSlot;
};

export type ErrorResponse = {
  error: string;
};

export function validateGenerateImageRequest(input: unknown): GenerateImageRequest {
  if (!input || typeof input !== 'object') {
    throw new Error('请求格式无效');
  }

  const candidate = input as Record<string, unknown>;
  const slot = candidate.slot;
  const prompt = candidate.prompt;

  if (!imageSlots.includes(slot as ImageSlot)) {
    throw new Error('无效的轮播区域');
  }
  if (typeof prompt !== 'string' || prompt.trim().length < 8) {
    throw new Error('提示词至少需要 8 个字符');
  }
  if (prompt.length > 1800) {
    throw new Error('提示词不能超过 1800 个字符');
  }

  return { slot: slot as ImageSlot, prompt: prompt.trim() };
}
