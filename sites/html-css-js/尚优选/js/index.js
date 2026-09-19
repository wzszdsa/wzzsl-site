/**
 * 尚优选 · 商品详情页交互
 * ------------------------------------------------------------
 * 依赖：js/data.js（提供全局 goodData，须在本文件之前引入）
 * 容器：index.html 中 #smallPic / #bigPic / .chooseWrap 等节点
 *
 * 职责：
 *   1. 面包屑渲染
 *   2. 主图放大镜
 *   3. 缩略图渲染、切换与左右滚动
 *   4. 商品信息与规格参数渲染
 *   5. 规格选择（排他选中、已选标签、价格联动）
 *   6. 搭配套餐勾选与价格联动
 *   7. 左右两侧选项卡切换
 *   8. 右侧边栏展开 / 收起
 *
 * 约定：
 *   - 统一使用 const / let，不使用 var
 *   - 所有 DOM 查询集中在下方的 els 对象中，缺失节点不再直接抛错
 *   - 价格计算统一走 recalcPrice()，避免多处重复
 */
(function () {
  'use strict';

  /* ============================================================
     工具
     ============================================================ */

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  /** 为元素绑定事件；元素不存在时静默跳过，避免整页脚本中断 */
  function on(el, type, handler) {
    if (!el) return;
    el.addEventListener(type, handler);
  }

  /** 数值兜底：非法输入返回 0，避免 NaN 渗入价格计算 */
  function toNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  /* ============================================================
     入口
     ============================================================ */

  window.addEventListener('load', function () {
    if (typeof goodData === 'undefined') {
      console.error('[尚优选] 未找到 goodData —— 请确认 js/data.js 已在 js/index.js 之前引入');
      return;
    }

    const detail = goodData.goodsDetail || {};
    const pathData = goodData.path || [];
    const imageSrc = goodData.imagessrc || [];

    /* 一次性收集 DOM 节点，后续复用 */
    const els = {
      navPath:     $('#navPath'),
      smallPic:    $('#smallPic'),
      smallImg:    $('#smallPic img'),
      mask:        $('.mask'),
      bigPic:      $('#bigPic'),
      bigImg:      $('#bigPic img'),
      picListUl:   $('.piclist ul'),
      prev:        $('.prev'),
      next:        $('.next'),
      rightTop:    $('.rightTop'),
      chooseWrap:  $('.chooseWrap'),
      choose:      $('.choose'),
      priceMain:   $('.price p'),
      priceLeft:   $('.listWrap .left p'),
      priceRight:  $('.listWrap .right i'),
      packageIpts: $$('.middle input'),
      asideBtn:    $('.btns.btnsClose'),
      asidePanel:  $('.rightAside.asideClose'),
    };

    /* 规格选中状态：与 .chooseWrap dl 一一对应，未选为 0 */
    const skuSelection = [];

    renderBreadcrumb();
    bindMagnifier();
    renderThumbnails();
    renderProductInfo();
    renderSpecs();
    bindSpecClick();
    bindPackageChange();
    initTabs($$('.asideTop h4'), $$('.asideContent > div'));
    initTabs($$('.tabBtns li'), $$('.tabContents > div'));
    bindAsideToggle();

    /* ==========================================================
       1. 面包屑
       ========================================================== */
    function renderBreadcrumb() {
      if (!els.navPath) return;
      const frag = document.createDocumentFragment();
      pathData.forEach(function (item, i) {
        const a = document.createElement('a');
        a.innerText = item.title;
        // 最后一项为当前页，不加链接
        if (i < pathData.length - 1) {
          a.href = item.url;
        }
        frag.appendChild(a);
        if (i < pathData.length - 1) {
          const sep = document.createElement('i');
          sep.innerText = '/';
          frag.appendChild(sep);
        }
      });
      els.navPath.appendChild(frag);
    }

    /* ==========================================================
       2. 主图放大镜
       ========================================================== */
    function bindMagnifier() {
      const { smallPic, mask, bigPic, bigImg } = els;
      if (!smallPic || !mask || !bigPic || !bigImg) return;

      on(smallPic, 'mouseover', function () {
        mask.style.display = 'block';
        bigPic.style.display = 'block';
      });
      on(smallPic, 'mouseout', function () {
        mask.style.display = 'none';
        bigPic.style.display = 'none';
      });

      on(smallPic, 'mousemove', function (e) {
        const rect = smallPic.getBoundingClientRect();
        const maskW = mask.offsetWidth;
        const maskH = mask.offsetHeight;

        // 让遮罩跟随光标并限制在图片范围内
        let top = e.clientY - rect.top - maskH / 2;
        let left = e.clientX - rect.left - maskW / 2;
        top = clamp(top, 0, smallPic.offsetHeight - maskH);
        left = clamp(left, 0, smallPic.offsetWidth - maskW);

        mask.style.top = top + 'px';
        mask.style.left = left + 'px';

        // 大图按尺寸比例反向位移
        const ratio = bigImg.offsetWidth / smallPic.offsetWidth || 1;
        bigImg.style.left = -left * ratio + 'px';
        bigImg.style.top = -top * ratio + 'px';
      });
    }

    function clamp(v, min, max) {
      if (max < min) return min;
      return Math.min(Math.max(v, min), max);
    }

    /* ==========================================================
       3. 缩略图
       ========================================================== */
    function renderThumbnails() {
      const ul = els.picListUl;
      if (!ul || imageSrc.length === 0) return;

      const frag = document.createDocumentFragment();
      imageSrc.forEach(function (item) {
        const li = document.createElement('li');
        const img = document.createElement('img');
        img.src = item.s;
        img.alt = '';
        li.appendChild(img);
        frag.appendChild(li);
      });
      ul.appendChild(frag);

      bindThumbnailClick(ul);
      bindThumbnailScroll(ul);
    }

    /** 点击缩略图切换主图与大图 */
    function bindThumbnailClick(ul) {
      $$('li', ul).forEach(function (li, i) {
        on(li, 'click', function () {
          if (!imageSrc[i]) return;
          if (els.smallImg) els.smallImg.src = imageSrc[i].s;
          if (els.bigImg) els.bigImg.src = imageSrc[i].b;
        });
      });
    }

    /** 缩略图左右滚动（每次两张） */
    function bindThumbnailScroll(ul) {
      const items = $$('li', ul);
      if (items.length === 0 || !els.prev || !els.next) return;

      const GAP = 20;
      const VISIBLE = 5;
      const step = (items[0].offsetWidth + GAP) * 2;
      const maxOffset = Math.max(0, (items.length - VISIBLE) * (items[0].offsetWidth + GAP));
      let offset = 0;

      function apply() {
        ul.style.left = -offset + 'px';
      }

      on(els.prev, 'click', function () {
        offset = clamp(offset - step, 0, maxOffset);
        apply();
      });
      on(els.next, 'click', function () {
        offset = clamp(offset + step, 0, maxOffset);
        apply();
      });
    }

    /* ==========================================================
       4. 商品信息与规格渲染
       ========================================================== */
    function renderProductInfo() {
      if (!els.rightTop || !detail.title) return;

      const promo = detail.promoteSales || {};
      els.rightTop.innerHTML =
        '<h3>' + esc(detail.title) + '</h3>' +
        '<p>' + esc(detail.recommend || '') + '</p>' +
        '<div class="priceWrap">' +
          '<div class="priceTop">' +
            '<span>价&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;格</span>' +
            '<div class="price"><span>￥</span><p>' + esc(detail.price) + '</p><i>降价通知</i></div>' +
            '<p><span>累计评价</span><span>' + esc(detail.evaluateNum || '') + '</span></p>' +
          '</div>' +
          '<div class="priceBottom">' +
            '<span>促&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;销</span>' +
            '<p><span>' + esc(promo.type || '') + '</span><span>' + esc(promo.content || '') + '</span></p>' +
          '</div>' +
        '</div>' +
        '<div class="support"><span>支&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;持</span><p>' + esc(detail.support || '') + '</p></div>' +
        '<div class="address"><span>配&nbsp;送&nbsp;至</span><p>' + esc(detail.address || '') + '</p></div>';

      // 渲染后重新取一次节点引用
      els.priceMain = $('.price p');
    }

    /** 简单的 HTML 转义，避免数据中的特殊字符破坏结构 */
    function esc(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    function renderSpecs() {
      const wrap = els.chooseWrap;
      const crumb = detail.crumbData || [];
      if (!wrap || crumb.length === 0) return;

      crumb.forEach(function (group) {
        const dl = document.createElement('dl');
        const dt = document.createElement('dt');
        dt.innerText = group.title;
        dl.appendChild(dt);

        (group.data || []).forEach(function (opt) {
          const dd = document.createElement('dd');
          dd.innerText = opt.type;
          dd.setAttribute('price', opt.changePrice);
          dl.appendChild(dd);
        });

        wrap.appendChild(dl);
        skuSelection.push(0);
      });
    }

    /* ==========================================================
       5. 规格选择
       ========================================================== */
    function bindSpecClick() {
      const dlList = $$('.chooseWrap dl');
      if (dlList.length === 0) return;

      dlList.forEach(function (dl, groupIndex) {
        $$('dd', dl).forEach(function (dd) {
          on(dd, 'click', function () {
            // 组内排他：先复位全部，再高亮当前
            $$('dd', dl).forEach(function (node) { node.style.color = '#666'; });
            dd.style.color = 'red';
            skuSelection[groupIndex] = dd;
            renderSelectedTags(dlList);
            recalcPrice();
          });
        });
      });
    }

    /** 渲染「已选」标签区 */
    function renderSelectedTags(dlList) {
      const box = els.choose;
      if (!box) return;
      box.innerHTML = '';

      skuSelection.forEach(function (dd, index) {
        if (!dd) return;

        const tag = document.createElement('div');
        tag.className = 'mark';
        tag.innerText = dd.innerText;

        const close = document.createElement('a');
        close.innerText = 'X';
        close.setAttribute('data-index', index);
        tag.appendChild(close);

        // 删除标签：恢复该组为默认项（第一项）
        on(close, 'click', function () {
          tag.parentNode.removeChild(tag);
          skuSelection[index] = 0;

          const group = dlList[index];
          if (group) {
            $$('dd', group).forEach(function (node) { node.style.color = '#666'; });
            const first = $('dd', group);
            if (first) first.style.color = 'red';
          }
          recalcPrice();
        });

        box.appendChild(tag);
      });
    }

    /* ==========================================================
       6. 价格计算（规格差价 + 套餐加价，统一入口）
       ========================================================== */
    function bindPackageChange() {
      els.packageIpts.forEach(function (ipt) {
        on(ipt, 'click', recalcPrice);
      });
    }

    function recalcPrice() {
      // 基础价 + 各规格组已选项的差价
      let skuPrice = toNum(detail.price);
      skuSelection.forEach(function (dd) {
        if (dd) skuPrice += toNum(dd.getAttribute('price'));
      });

      // 再叠加勾选的搭配套餐
      let totalPrice = skuPrice;
      els.packageIpts.forEach(function (ipt) {
        if (ipt.checked) totalPrice += toNum(ipt.value);
      });

      if (els.priceMain)  els.priceMain.innerText = skuPrice;
      if (els.priceLeft)  els.priceLeft.innerText = '￥' + skuPrice;
      if (els.priceRight) els.priceRight.innerText = '￥' + totalPrice;
    }

    /* ==========================================================
       7. 选项卡
       ========================================================== */
    /**
     * 通用选项卡：按钮与内容面板一一对应
     * @param {HTMLElement[]} btns  触发按钮
     * @param {HTMLElement[]} panes 内容面板
     */
    function initTabs(btns, panes) {
      if (!btns || !panes || btns.length === 0) return;

      btns.forEach(function (btn, i) {
        on(btn, 'click', function () {
          btns.forEach(function (b, j) {
            b.className = '';
            if (panes[j]) panes[j].className = '';
          });
          btn.className = 'active';
          if (panes[i]) panes[i].className = 'active';
        });
      });
    }

    /* ==========================================================
       8. 右侧边栏展开 / 收起
       ========================================================== */
    function bindAsideToggle() {
      if (!els.asideBtn || !els.asidePanel) return;

      on(els.asideBtn, 'click', function () {
        els.asideBtn.classList.toggle('btnsOpen');
        els.asideBtn.classList.toggle('btnsClose');
        els.asidePanel.classList.toggle('asideClose');
        els.asidePanel.classList.toggle('asideOpen');
      });
    }
  });
})();
