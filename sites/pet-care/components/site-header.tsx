export function SiteHeader() {
  return (
    <header className="topbar">
      <div className="wrap">
        <div className="brand">
          <div className="logo">🐾</div>
          <div>
            <div>汪汪喵喵宠物洗护店</div>
            <small className="brand-subtitle">洗护 · 美容 · 护理</small>
          </div>
        </div>
        <nav className="nav" aria-label="主导航">
          <a href="#services">服务</a>
          <a href="#process">流程</a>
          <a href="#price">价格</a>
          <a href="#contact">预约</a>
        </nav>
      </div>
    </header>
  );
}
