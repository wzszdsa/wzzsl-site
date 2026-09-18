'use client';

import { useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';

const AUTOPLAY_MS = 4500;

const reviews = [
  ['“洗完毛特别顺，店员也很耐心。”', '我家金毛平时不太配合，这家店能安抚好情绪，回家后状态也很好。'],
  ['“猫咪也能安心洗，细节做得不错。”', '预约流程清楚，洗护过程中会反馈状态，整个体验很省心。'],
  ['“价格透明，没有乱加项。”', '先沟通再开始，做完后再看结果，比较适合长期来做日常护理。']
] as const;

type ReviewPosition = 'previous' | 'active' | 'next' | 'hidden';

export function getNextReviewIndex(currentIndex: number, total: number) {
  if (total <= 0) return 0;
  return (currentIndex + 1) % total;
}

function getReviewPosition(index: number, activeIndex: number, total: number): ReviewPosition {
  if (index === activeIndex) return 'active';
  if (total > 1 && index === (activeIndex - 1 + total) % total) return 'previous';
  if (total > 1 && index === (activeIndex + 1) % total) return 'next';
  return 'hidden';
}

export function ReviewsCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [autoplayKey, setAutoplayKey] = useState(0);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateReducedMotion = () => setReducedMotion(mediaQuery.matches);

    updateReducedMotion();
    mediaQuery.addEventListener('change', updateReducedMotion);

    return () => mediaQuery.removeEventListener('change', updateReducedMotion);
  }, []);

  useEffect(() => {
    if (isPaused || reducedMotion || reviews.length < 2) return undefined;

    const timer = window.setInterval(() => {
      setActiveIndex((currentIndex) => getNextReviewIndex(currentIndex, reviews.length));
    }, AUTOPLAY_MS);

    return () => window.clearInterval(timer);
  }, [autoplayKey, isPaused, reducedMotion]);

  const goToReview = (index: number) => {
    setActiveIndex(index);
    setAutoplayKey((currentKey) => currentKey + 1);
  };

  const goToNextReview = () => {
    goToReview(getNextReviewIndex(activeIndex, reviews.length));
  };

  const goToPreviousReview = () => {
    goToReview((activeIndex - 1 + reviews.length) % reviews.length);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goToPreviousReview();
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      goToNextReview();
    }
  };

  return (
    <div
      className="reviews-carousel"
      data-autoplay-ms={AUTOPLAY_MS}
      aria-label="客户评价"
      aria-roledescription="carousel"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div className="reviews-viewport" aria-live="polite">
        {reviews.map(([title, copy], index) => {
          const isActive = index === activeIndex;
          const position = getReviewPosition(index, activeIndex, reviews.length);

          return (
            <article
              className={`review-slide review-slide--${position}`}
              key={title}
              aria-current={isActive ? 'true' : undefined}
              aria-hidden={!isActive}
              aria-label={`${index + 1} / ${reviews.length}`}
            >
              <div className="stars" aria-label="五星好评">★★★★★</div>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          );
        })}
      </div>

      <div className="reviews-controls">
        <button className="review-arrow" type="button" aria-label="上一条评价" onClick={goToPreviousReview}>
          ←
        </button>
        <div className="review-dots" role="group" aria-label="评价切换">
          {reviews.map(([title], index) => (
            <button
              className={`review-dot${index === activeIndex ? ' is-active' : ''}`}
              type="button"
              key={title}
              aria-label={`切换到第 ${index + 1} 条评价`}
              aria-current={index === activeIndex ? 'true' : undefined}
              onClick={() => goToReview(index)}
            />
          ))}
        </div>
        <button className="review-arrow" type="button" aria-label="下一条评价" onClick={goToNextReview}>
          →
        </button>
      </div>
    </div>
  );
}
