/**
 * 虚拟钢琴
 * ------------------------------------------------------------
 * 交互：
 *   - 点击琴键 / 按下键盘对应字符 播放音符
 *   - 音量滑杆调节音量
 *   - 勾选框切换琴键上的字母提示
 *
 * 音频文件位于 tunes/<key>.wav，与琴键的 data-key 一一对应。
 *
 * 约定：统一 const / let；DOM 节点缺失时静默降级而非抛错；
 *       音频对象按需创建并缓存，避免每次按键都重新请求。
 */
(function () {
  'use strict';

  const KEYS = Array.prototype.slice.call(document.querySelectorAll('.piano-keys .key'));
  const volumeSlider = document.querySelector('.volume-slider input');
  const keysCheckbox = document.querySelector('.keys-checkbox input');

  if (KEYS.length === 0) {
    console.warn('[钢琴] 未找到琴键节点，脚本未启动');
    return;
  }

  /** 琴键字符集合，用于键盘事件匹配 */
  const ALL_KEYS = KEYS.map(function (el) { return el.dataset.key; });

  /** 音频缓存：key -> Audio，避免重复构造与重复网络请求 */
  const audioCache = Object.create(null);
  /** 复用同一个 Audio 实例调节音量 */
  let masterVolume = 0.5;

  function getAudio(key) {
    if (!audioCache[key]) {
      const a = new Audio('tunes/' + key + '.wav');
      a.volume = masterVolume;
      // 预加载，首次按下时更跟手
      a.preload = 'auto';
      audioCache[key] = a;
    }
    return audioCache[key];
  }

  /**
   * 播放指定音符
   * @param {string} key 与 data-key 对应的字符
   */
  function playTune(key) {
    if (!key) return;

    const audio = getAudio(key);
    // 从头发声：连按同一个键时重新播放而不是忽略
    try {
      audio.currentTime = 0;
    } catch (err) {
      /* 部分浏览器在未加载完成时不允许设置 currentTime，忽略即可 */
    }

    // play() 返回 Promise，自动播放策略下可能被拒绝 —— 必须捕获，
    // 否则控制台会出现未处理的 Promise 拒绝
    const p = audio.play();
    if (p && typeof p.catch === 'function') {
      p.catch(function (err) {
        console.warn('[钢琴] 播放被浏览器拦截（需用户先与页面交互）:', err && err.name);
      });
    }

    flashKey(key);
  }

  /** 琴键按下反馈：短暂高亮 */
  function flashKey(key) {
    const el = document.querySelector('[data-key="' + cssEscape(key) + '"]');
    if (!el) return;
    el.classList.add('active');
    window.setTimeout(function () {
      el.classList.remove('active');
    }, 200);
  }

  /** 属性选择器值转义，避免特殊字符破坏选择器 */
  function cssEscape(v) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(v);
    }
    return String(v).replace(/["\\]/g, '\\$&');
  }

  /* ---------------- 事件绑定 ---------------- */

  KEYS.forEach(function (el) {
    el.addEventListener('click', function () {
      playTune(el.dataset.key);
    });
  });

  if (volumeSlider) {
    volumeSlider.addEventListener('input', function (e) {
      const v = Number(e.target.value);
      masterVolume = Number.isFinite(v) ? v : masterVolume;
      // 同步到所有已创建的音频实例
      Object.keys(audioCache).forEach(function (k) {
        audioCache[k].volume = masterVolume;
      });
    });
  }

  if (keysCheckbox) {
    keysCheckbox.addEventListener('click', function () {
      KEYS.forEach(function (el) { el.classList.toggle('hide'); });
    });
  }

  document.addEventListener('keydown', function (e) {
    // 忽略输入框内的按键，避免打字时触发琴音
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    const key = e.key.toLowerCase();
    if (ALL_KEYS.indexOf(key) !== -1) {
      e.preventDefault();
      playTune(key);
    }
  });
})();
