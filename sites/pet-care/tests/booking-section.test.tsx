// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BookingSection } from '../components/booking-section';
import { submitAppointmentForm } from '../lib/appointment-form';

vi.mock('../lib/appointment-form', async () => {
  const actual = await vi.importActual<typeof import('../lib/appointment-form')>('../lib/appointment-form');

  return { ...actual, submitAppointmentForm: vi.fn() };
});

const submitAppointmentFormMock = vi.mocked(submitAppointmentForm);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('BookingSection', () => {
  it('provides the static appointment form contract without paragraph feedback spacing', () => {
    const markup = renderToStaticMarkup(<BookingSection />);

    expect(markup).toContain('name="customerName"');
    expect(markup).toContain('name="phone"');
    expect(markup).toContain('name="petName"');
    expect(markup).toContain('name="petType"');
    expect(markup).toContain('name="service"');
    expect(markup).toContain('>期望到店时间</label>');
    expect(markup).toContain('id="appointment-time"');
    expect(markup).toContain('name="appointmentTime"');
    expect(markup).toContain('type="datetime-local"');
    expect(markup).toContain('name="note"');
    expect(markup).toContain('maxLength="100"');
    expect(markup).toContain('maxLength="20"');
    expect(markup).toContain('maxLength="80"');
    expect(markup).toContain('maxLength="1000"');
    expect(markup).toMatch(/<input[^>]*required=""[^>]*name="customerName"/);
    expect(markup).toMatch(/<input[^>]*required=""[^>]*name="phone"/);
    expect(markup).toMatch(/<input[^>]*required=""[^>]*name="petName"/);
    expect(markup).toMatch(/<select[^>]*name="petType"[^>]*required=""/);
    expect(markup).toMatch(/<select[^>]*name="service"[^>]*required=""/);
    expect(markup).toMatch(/<input[^>]*required=""[^>]*name="appointmentTime"/);
    expect(markup).toContain('type="submit"');
    expect(markup).toContain('type="button"');
    expect(markup).toContain('<div class="form-feedback" aria-live="polite"></div>');
    expect(markup).not.toContain('<p aria-live="polite"');
    expect(markup).toMatch(/min="\d{4}-\d{2}-\d{2}T\d{2}:\d{2}"/);
    expect(markup).toMatch(/value="\d{4}-\d{2}-\d{2}T09:30"/);
  });

  it('submits, disables while pending, then resets and shows success', async () => {
    let resolveSubmission!: (value: Awaited<ReturnType<typeof submitAppointmentForm>>) => void;
    const submission = new Promise<Awaited<ReturnType<typeof submitAppointmentForm>>>((resolve) => {
      resolveSubmission = resolve;
    });
    submitAppointmentFormMock.mockReturnValue(submission);

    render(<BookingSection />);
    const submitButton = screen.getByRole('button', { name: '提交预约' }) as HTMLButtonElement;
    const form = submitButton.closest('form')!;
    const customerName = screen.getByLabelText('家长姓名') as HTMLInputElement;
    const phone = screen.getByLabelText('联系电话') as HTMLInputElement;
    const petName = screen.getByLabelText('宠物名字') as HTMLInputElement;
    const petType = screen.getByLabelText('宠物类型') as HTMLSelectElement;
    const service = screen.getByLabelText('想要服务') as HTMLSelectElement;
    const appointmentTime = screen.getByLabelText('期望到店时间') as HTMLInputElement;
    const note = screen.getByLabelText('补充说明') as HTMLTextAreaElement;
    fireEvent.change(customerName, { target: { value: '林女士' } });
    fireEvent.change(phone, { target: { value: '138-0000-0000' } });
    fireEvent.change(petName, { target: { value: '雪球' } });
    fireEvent.change(petType, { target: { value: '猫咪' } });
    fireEvent.change(service, { target: { value: '美容修剪' } });
    fireEvent.change(appointmentTime, { target: { value: '2026-08-22T10:30' } });
    fireEvent.change(note, { target: { value: '怕吹风' } });
    fireEvent.submit(form);

    expect(screen.getByRole('button', { name: '提交中…' })).toBe(submitButton);
    expect(submitButton.disabled).toBe(true);
    expect(submitAppointmentFormMock).toHaveBeenCalledTimes(1);
    const submittedFormData = submitAppointmentFormMock.mock.calls[0][0];
    expect(submittedFormData.get('customerName')).toBe('林女士');
    expect(submittedFormData.get('phone')).toBe('138-0000-0000');
    expect(submittedFormData.get('petName')).toBe('雪球');
    expect(submittedFormData.get('petType')).toBe('猫咪');
    expect(submittedFormData.get('service')).toBe('美容修剪');
    expect(submittedFormData.get('appointmentTime')).toBe('2026-08-22T10:30');
    expect(submittedFormData.get('note')).toBe('怕吹风');

    resolveSubmission({ ok: true, id: 'appointment-1', status: 'pending', createdAt: '2026-08-21T01:00:00.000Z' });

    const successFeedback = await screen.findByText('预约提交成功，我们会尽快与您确认时间。');
    const successCard = successFeedback.closest('.form-feedback');
    expect(successCard).not.toBeNull();
    expect(successCard?.classList.contains('form-feedback--success')).toBe(true);
    expect(successCard?.getAttribute('aria-live')).toBe('polite');
    expect(successCard?.textContent).toContain('✓');
    expect(successFeedback.getAttribute('role')).toBeNull();
    expect(submitButton.disabled).toBe(false);
    expect(customerName.value).toBe('');
    expect(phone.value).toBe('');
    expect(petName.value).toBe('');
    expect(note.value).toBe('');
  });

  it('keeps submit disabled while the submission promise is unresolved', async () => {
    submitAppointmentFormMock.mockReturnValue(new Promise(() => {}));

    render(<BookingSection />);
    const submitButton = screen.getByRole('button', { name: '提交预约' }) as HTMLButtonElement;
    fireEvent.submit(submitButton.closest('form')!);

    await waitFor(() => expect(submitButton.disabled).toBe(true));
    await Promise.resolve();
    expect(submitButton.disabled).toBe(true);
    expect(submitAppointmentFormMock).toHaveBeenCalledTimes(1);
  });

  it('shows the helper error as an alert and preserves entered values', async () => {
    submitAppointmentFormMock.mockResolvedValue({ ok: false, message: '联系电话格式无效' });

    render(<BookingSection />);
    const submitButton = screen.getByRole('button', { name: '提交预约' }) as HTMLButtonElement;
    const customerName = screen.getByLabelText('家长姓名') as HTMLInputElement;
    const phone = screen.getByLabelText('联系电话') as HTMLInputElement;
    fireEvent.change(customerName, { target: { value: '林女士' } });
    fireEvent.change(phone, { target: { value: '123' } });
    fireEvent.submit(submitButton.closest('form')!);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('联系电话格式无效');
    expect(customerName.value).toBe('林女士');
    expect(phone.value).toBe('123');
    expect(submitButton.disabled).toBe(false);
  });

  it('shows the fallback error and re-enables submit when the helper throws', async () => {
    submitAppointmentFormMock.mockRejectedValue(new Error('unexpected failure'));

    render(<BookingSection />);
    const submitButton = screen.getByRole('button', { name: '提交预约' }) as HTMLButtonElement;
    fireEvent.submit(submitButton.closest('form')!);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('预约提交失败，请稍后再试');
    expect(submitButton.disabled).toBe(false);
  });
});
