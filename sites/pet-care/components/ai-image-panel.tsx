'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { ImageSlot } from '@/lib/image-contract';

const promptBySlot: Record<ImageSlot, string> = {
  reception: '中国一线城市高端宠物洗护店接待区，现代东方极简室内设计，米白微水泥墙面，浅木色与墨绿色细节，品牌感灯箱，干净明亮，柔和自然光，真实室内摄影，横向构图，无文字无水印',
  wash: '中国高端宠物洗护店专业洗护区，独立洗护工位，白色与浅木色材质，不锈钢设备整洁隐藏，暖白灯光，低噪舒适，现代东方极简风格，真实室内摄影，横向构图，无文字无水印',
  care: '中国高端宠物洗护店美容护理区，独立美容台与护理工具，墨绿色软装点缀，浅灰微水泥地面，秩序整洁，高级酒店式宠物护理空间，柔和自然光，真实室内摄影，横向构图，无文字无水印'
};

export function AiImagePanel() {
  const [slot, setSlot] = useState<ImageSlot>('reception');
  const [prompt, setPrompt] = useState(promptBySlot.reception);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [model, setModel] = useState('gpt-image-2');
  const [requiresToken, setRequiresToken] = useState(false);
  const [adminToken, setAdminToken] = useState('');
  const [status, setStatus] = useState('正在检查绘图服务');
  const [generatedUrl, setGeneratedUrl] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/status')
      .then(async (response) => {
        const data = await response.json();
        setConfigured(Boolean(data.configured));
        setModel(data.model || 'gpt-image-2');
        setRequiresToken(Boolean(data.authRequired));
        setStatus(data.configured ? '绘图服务已连接 · ' + data.model : '绘图服务未配置 API Key');
      })
      .catch(() => {
        setConfigured(false);
        setStatus('请通过 Next.js 服务打开页面');
      });
  }, []);

  const handleSlotChange = (nextSlot: ImageSlot) => {
    setSlot(nextSlot);
    setPrompt(promptBySlot[nextSlot]);
    setGeneratedUrl('');
    setStatus(configured ? '绘图服务已连接 · ' + model : '绘图服务未配置 API Key');
  };

  const handleGenerate = async () => {
    setLoading(true);
    setGeneratedUrl('');
    setStatus('正在生成环境图');
    try {
      const response = await fetch('/api/generate-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminToken ? { 'x-ai-image-token': adminToken } : {})
        },
        body: JSON.stringify({ slot, prompt: prompt.trim() })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '生成失败');
      setGeneratedUrl(data.url);
      setStatus('生成完成，可应用到轮播');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '生成失败');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!generatedUrl) return;
    try {
      window.localStorage.setItem('pet-care-generated-' + slot, generatedUrl);
      setStatus('已应用到轮播图');
    } catch {
      setStatus('已应用到当前轮播图，浏览器未允许持久化保存');
    }
    window.dispatchEvent(new CustomEvent('pet-care-image-updated', { detail: { slot, url: generatedUrl } }));
  };

  return (
    <section className="section" id="ai-draw">
      <div className="section-head">
        <div>
          <h2>AI 环境图</h2>
          <p>生成后可直接应用到上方轮播图。</p>
        </div>
      </div>
      <div className="ai-draw">
        <div className="ai-form">
          <div className="ai-status"><span className={'status-dot' + (configured ? ' ready' : configured === false ? ' error' : '')} /><span>{status}</span></div>
          <h3>生成店内场景</h3>
          <p>选择区域并补充风格，生成一张横向门店环境图。</p>
          <div>
            <label htmlFor="ai-slot">应用区域</label>
            <select id="ai-slot" value={slot} onChange={(event) => handleSlotChange(event.target.value as ImageSlot)}>
              <option value="reception">接待区</option>
              <option value="wash">洗护区</option>
              <option value="care">美容护理区</option>
            </select>
          </div>
          {requiresToken && <div style={{ marginTop: 12 }}>
            <label htmlFor="ai-token">AI 绘图访问令牌</label>
            <input id="ai-token" type="password" value={adminToken} onChange={(event) => setAdminToken(event.target.value)} placeholder="请输入服务端配置的访问令牌" autoComplete="off" />
          </div>}
          <div style={{ marginTop: 12 }}>
            <label htmlFor="ai-prompt">画面描述</label>
            <textarea id="ai-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          </div>
          <div className="ai-actions">
            <button className="btn btn-primary" id="ai-generate" type="button" onClick={handleGenerate} disabled={loading || configured === false}>{loading ? '生成中...' : '✦ 生成环境图'}</button>
            <button className="btn btn-secondary" id="ai-apply" type="button" onClick={handleApply} disabled={!generatedUrl}>应用到轮播</button>
          </div>
          <div className="ai-hint">需要通过 Next.js 服务运行，并在服务端配置 OPENAI_API_KEY。</div>
        </div>
        <div className="ai-preview">
          <h3>生成预览</h3>
          <div className="ai-preview-stage">
            {generatedUrl ? <Image src={generatedUrl} alt="AI 生成的宠物洗护店环境图" fill sizes="(max-width: 720px) 100vw, 50vw" className="ai-preview-image" unoptimized /> : <div className="ai-empty">生成的图片会显示在这里</div>}
          </div>
        </div>
      </div>
    </section>
  );
}
