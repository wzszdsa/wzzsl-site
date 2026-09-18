import { describe, expect, it } from 'vitest';
import { validateGenerateImageRequest } from '../lib/image-contract';

describe('validateGenerateImageRequest', () => {
  it('accepts a valid generation request', () => {
    expect(validateGenerateImageRequest({ slot: 'reception', prompt: 'a premium pet salon reception area' })).toEqual({
      slot: 'reception',
      prompt: 'a premium pet salon reception area'
    });
  });

  it('rejects an unsupported slot', () => {
    expect(() => validateGenerateImageRequest({ slot: 'lobby', prompt: 'a premium pet salon reception area' })).toThrow('无效的轮播区域');
  });

  it('rejects prompts shorter than eight characters', () => {
    expect(() => validateGenerateImageRequest({ slot: 'wash', prompt: 'short' })).toThrow('提示词至少需要 8 个字符');
  });
});
