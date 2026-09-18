import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReviewsCarousel, getNextReviewIndex } from '../components/reviews-carousel';

describe('ReviewsCarousel', () => {
  it('renders an accessible carousel with the initial review and controls', () => {
    const markup = renderToStaticMarkup(<ReviewsCarousel />);

    expect(markup).toContain('aria-roledescription="carousel"');
    expect(markup).toContain('aria-label="客户评价"');
    expect(markup).toContain('洗完毛特别顺，店员也很耐心。');
    expect(markup).toContain('aria-label="上一条评价"');
    expect(markup).toContain('aria-label="下一条评价"');
    expect(markup).toContain('aria-label="切换到第 1 条评价"');
    expect(markup).toContain('data-autoplay-ms="4500"');
  });

  it('wraps to the first review after the last review', () => {
    expect(getNextReviewIndex(2, 3)).toBe(0);
    expect(getNextReviewIndex(0, 3)).toBe(1);
  });
});
