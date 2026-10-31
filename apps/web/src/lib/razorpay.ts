/**
 * Razorpay Checkout: load their script on demand, open the payment popup, and hand the signed
 * result to our API for verification. The browser is never trusted to say "I paid" - the API checks
 * the HMAC signature (and the webhook confirms independently).
 */
import { api } from './api';

interface CheckoutOrder {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  courseTitle: string;
}

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadScript(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load the payment window'));
    document.body.appendChild(s);
  });
}

export async function payForCourse(courseId: string, user: { name: string; email: string }): Promise<void> {
  const { data: order } = await api.post<CheckoutOrder>(`/api/courses/${courseId}/checkout`);
  await loadScript();

  return new Promise((resolve, reject) => {
    const rzp = new window.Razorpay!({
      key: order.keyId || import.meta.env.VITE_RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency,
      name: 'TalentEd',
      description: order.courseTitle,
      order_id: order.orderId,
      prefill: { name: user.name, email: user.email },
      theme: { color: '#2a55e0' },
      handler: async (response: RazorpayResponse) => {
        try {
          await api.post('/api/payments/verify', response);
          resolve();
        } catch (err) {
          reject(err);
        }
      },
      modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
    });
    rzp.open();
  });
}
