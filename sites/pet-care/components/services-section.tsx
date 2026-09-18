export function ServicesSection() {
  return (
    <section className="section" id="services">
      <div className="section-head"><div><h2>服务项目</h2><p>覆盖日常清洁、造型整理与基础护理。</p></div></div>
      <div className="grid-4">
        <article className="service"><div className="icon">🛁</div><h3>基础洗护</h3><p>洗澡、护毛、吹干、梳理，适合日常保养。</p></article>
        <article className="service"><div className="icon">✂️</div><h3>美容修剪</h3><p>按品种和体型做局部修剪与造型整理。</p></article>
        <article className="service"><div className="icon">👂</div><h3>耳道护理</h3><p>清洁耳廓与耳道外围，减少异味和堆积。</p></article>
        <article className="service"><div className="icon">🧴</div><h3>皮毛护理</h3><p>针对干燥、打结、掉毛提供护理建议。</p></article>
      </div>
    </section>
  );
}
