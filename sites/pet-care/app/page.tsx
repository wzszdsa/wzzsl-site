import { BookingSection } from '@/components/booking-section';
import { HeroCarousel } from '@/components/hero-carousel';
import { ServicesSection } from '@/components/services-section';
import { ProcessSection, PricingSection, ReviewsSection } from '@/components/store-sections';
import { SiteHeader } from '@/components/site-header';

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <section className="hero">
          <div className="hero-grid">
            <div className="hero-copy">
              <span className="eyebrow">今日可预约 · 1小时基础洗护</span>
              <h1>让毛孩子洗得干净，也洗得安心。</h1>
              <p className="lead">专业宠物洗护、美容修剪、耳道护理和护理建议，一站式完成。我们重视舒适度、卫生和每一次接触的细节，适合猫咪与狗狗日常洗护。</p>
              <div className="cta-row"><a className="btn btn-primary" href="#contact"><span>立即预约</span><span>→</span></a><a className="btn btn-secondary" href="#services">查看服务</a></div>
              <div className="hero-meta"><div className="mini"><strong>4.9/5</strong><span>顾客满意度</span></div><div className="mini"><strong>3000+</strong><span>累计洗护</span></div><div className="mini"><strong>0刺激</strong><span>温和护理理念</span></div></div>
            </div>
            <div className="hero-visual">
              <HeroCarousel />
              <div className="visual-note"><div className="note"><b>舒适环境</b><p>低噪风机、恒温水洗，减少宠物紧张。</p></div><div className="note"><b>透明沟通</b><p>洗前确认需求，洗后反馈毛发与皮肤状态。</p></div></div>
            </div>
          </div>
        </section>
        <ServicesSection />
        <ProcessSection />
        <PricingSection />
        <ReviewsSection />
        <BookingSection />
      </main>
      <footer className="footer">© 2026 汪汪喵喵宠物洗护店 · 环境图参考：Structures &amp; Interiors</footer>
    </>
  );
}
