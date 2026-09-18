'use client';

import { useState, type FormEvent } from 'react';
import { formatShanghaiDateTime, getTomorrowMorningAppointmentTime } from '../lib/appointment-time';
import { submitAppointmentForm } from '../lib/appointment-form';

const fallbackMessage = '预约提交失败，请稍后再试';

export function BookingSection() {
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const now = new Date();
  const minAppointmentTime = formatShanghaiDateTime(now);
  const defaultAppointmentTime = getTomorrowMorningAppointmentTime(now);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    const form = event.currentTarget;
    try {
      const result = await submitAppointmentForm(new FormData(form));

      if (result.ok) {
        form.reset();
        setFeedback({ type: 'success', message: '预约提交成功，我们会尽快与您确认时间。' });
      } else {
        setFeedback({ type: 'error', message: result.message });
      }
    } catch {
      setFeedback({ type: 'error', message: fallbackMessage });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="section" id="contact">
      <div className="section-head"><div><h2>预约咨询</h2><p>填写信息后我们会尽快确认时间。</p></div></div>
      <div className="contact">
        <form className="form" onSubmit={handleSubmit}>
          <div className="field-grid">
            <div><label htmlFor="name">家长姓名</label><input id="name" name="customerName" type="text" placeholder="请输入姓名" maxLength={100} required /></div>
            <div><label htmlFor="phone">联系电话</label><input id="phone" name="phone" type="tel" placeholder="请输入手机号" maxLength={20} required /></div>
            <div><label htmlFor="pet">宠物名字</label><input id="pet" name="petName" type="text" placeholder="例如：雪球" maxLength={80} required /></div>
            <div><label htmlFor="type">宠物类型</label><select id="type" name="petType" required><option>狗狗</option><option>猫咪</option><option>其他</option></select></div>
            <div><label htmlFor="service">想要服务</label><select id="service" name="service" required><option>基础洗护</option><option>美容修剪</option><option>耳道护理</option><option>深度护理</option></select></div>
            <div><label htmlFor="appointment-time">期望到店时间</label><input id="appointment-time" name="appointmentTime" type="datetime-local" min={minAppointmentTime} defaultValue={defaultAppointmentTime} required /></div>
          </div>
          <div style={{ marginTop: 12 }}><label htmlFor="note">补充说明</label><textarea id="note" name="note" placeholder="例如：怕吹风、容易打结、需要剪指甲等" maxLength={1000} /></div>
          <div className="actions"><button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? '提交中…' : '提交预约'}</button><button className="btn btn-secondary" type="button">联系门店</button></div>
          <div
            className={feedback?.type === 'success' ? 'form-feedback form-feedback--success' : feedback?.type === 'error' ? 'form-feedback form-feedback--error' : 'form-feedback'}
            aria-live="polite"
            role={feedback?.type === 'error' ? 'alert' : undefined}
          >
            {feedback?.type === 'success' && <span className="form-feedback__icon" aria-hidden="true">✓</span>}
            {feedback?.message && <span>{feedback.message}</span>}
          </div>
        </form>
        <aside className="info">
          <div className="info-item"><div className="icon" style={{ margin: 0 }}>📍</div><div><b>门店地址</b><p>上海市某某区幸福路 88 号 1 层</p></div></div>
          <div className="info-item"><div className="icon" style={{ margin: 0 }}>⏰</div><div><b>营业时间</b><p>周一至周日 10:00 - 20:00</p></div></div>
          <div className="info-item"><div className="icon" style={{ margin: 0 }}>☎️</div><div><b>联系电话</b><p>138-0000-0000</p></div></div>
        </aside>
      </div>
    </section>
  );
}
