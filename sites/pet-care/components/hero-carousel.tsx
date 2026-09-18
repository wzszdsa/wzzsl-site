'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { ImageSlot } from '@/lib/image-contract';

type Slide = {
  slot: ImageSlot;
  src: string;
  alt: string;
  title: string;
  description: string;
};

const slides: Slide[] = [
  { slot: 'reception', src: '/assets/reception-area-ai.png', alt: '高端宠物洗护店接待区', title: '明亮接待区', description: '柔和灯光与清晰动线，第一次到店也很轻松。' },
  { slot: 'wash', src: '/assets/wash-area-ai.png', alt: '宠物洗护操作区', title: '专业洗护区', description: '恒温水洗、低噪吹干，关注每一次舒适体验。' },
  { slot: 'care', src: '/assets/care-area-ai.png', alt: '宠物美容护理区', title: '美容护理区', description: '整洁设备与独立操作位，让护理过程更有秩序。' }
];

type ImageUpdateEvent = CustomEvent<{ slot: ImageSlot; url: string }>;

export function HeroCarousel() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const [overrides, setOverrides] = useState<Partial<Record<ImageSlot, string>>>({});

  useEffect(() => {
    let saved: Partial<Record<ImageSlot, string>> = {};
    try {
      saved = slides.reduce<Partial<Record<ImageSlot, string>>>((result, slide) => {
        const value = window.localStorage.getItem('pet-care-generated-' + slide.slot);
        if (value) result[slide.slot] = value;
        return result;
      }, {});
    } catch {
      saved = {};
    }
    const timeout = window.setTimeout(() => setOverrides(saved), 0);

    const handleUpdate = (event: Event) => {
      const detail = (event as ImageUpdateEvent).detail;
      setOverrides((previous) => ({ ...previous, [detail.slot]: detail.url }));
    };

    window.addEventListener('pet-care-image-updated', handleUpdate);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('pet-care-image-updated', handleUpdate);
    };
  }, []);

  useEffect(() => {
    if (paused) return;
    const interval = window.setInterval(() => {
      setCurrentSlide((previous) => (previous + 1) % slides.length);
    }, 4800);
    return () => window.clearInterval(interval);
  }, [paused]);

  const goTo = (index: number) => setCurrentSlide((index + slides.length) % slides.length);
  const activeSlide = slides[currentSlide];

  return (
    <div className="carousel" aria-label="店内环境轮播图" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {slides.map((slide, index) => (
        <div className={'slide' + (index === currentSlide ? ' is-active' : '')} key={slide.slot}>
          <Image
            src={overrides[slide.slot] || slide.src}
            alt={slide.alt}
            fill
            sizes="(max-width: 720px) 100vw, 50vw"
            className="slide-image"
            priority={index === 0}
          />
          <div className="slide-copy"><b>{slide.title}</b><span>{slide.description}</span></div>
        </div>
      ))}
      <div className="carousel-actions">
        <div className="carousel-dots" aria-label="选择轮播图">
          {slides.map((slide, index) => (
            <button className={'dot' + (index === currentSlide ? ' is-active' : '')} type="button" aria-label={'查看第 ' + (index + 1) + ' 张图片'} aria-current={index === currentSlide} onClick={() => goTo(index)} key={slide.slot} />
          ))}
        </div>
        <button className="carousel-btn" type="button" aria-label="上一张" onClick={() => goTo(currentSlide - 1)}>‹</button>
        <button className="carousel-btn" type="button" aria-label="下一张" onClick={() => goTo(currentSlide + 1)}>›</button>
      </div>
      <span className="sr-only">当前区域：{activeSlide.title}</span>
    </div>
  );
}

