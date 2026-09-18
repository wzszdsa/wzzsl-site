import { ReviewsCarousel } from '@/components/reviews-carousel';

export function ProcessSection() {
  return (
    <section className="section" id="process">
      <div className="section-head"><div><h2>洗护流程</h2><p>步骤清晰，家长更放心。</p></div></div>
      <div className="steps">
        <div className="step"><h3>到店登记</h3><p>确认宠物体型、毛发状态和特殊注意事项。</p></div>
        <div className="step"><h3>温和清洗</h3><p>使用适合皮肤的洗护产品，避免刺激。</p></div>
        <div className="step"><h3>吹干梳理</h3><p>分层吹干，减少打结并提升蓬松度。</p></div>
        <div className="step"><h3>检查交付</h3><p>整理造型并反馈清洁结果与后续建议。</p></div>
      </div>
    </section>
  );
}

export function PricingSection() {
  const prices = [
    { title: '小型犬 / 猫咪', rows: [['基础洗护', '¥68 起'], ['美容修剪', '¥128 起']] },
    { title: '中型犬', rows: [['基础洗护', '¥88 起'], ['深度护理', '¥158 起']] },
    { title: '大型犬', rows: [['基础洗护', '¥118 起'], ['全套护理', '¥198 起']] }
  ];
  return (
    <section className="section" id="price">
      <div className="section-head"><div><h2>价格区间</h2><p>按体型和服务内容灵活调整。</p></div></div>
      <div className="grid-3">{prices.map((price) => <div className="price" key={price.title}><h3>{price.title}</h3><div className="price-list">{price.rows.map(([name, value]) => <div className="price-row" key={name}><span>{name}</span><em>{value}</em></div>)}</div></div>)}</div>
    </section>
  );
}

export function ReviewsSection() {
  return (
    <section className="section">
      <div className="section-head"><div><h2>真实口碑</h2><p>让服务细节更有说服力。</p></div></div>
      <ReviewsCarousel />
    </section>
  );
}
