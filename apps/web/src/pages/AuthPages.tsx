/**
 * Login and signup. Validation uses the SAME Zod schemas as the API (via zodResolver),
 * and server-side field errors (400) are mapped back onto the same form fields.
 */
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, signupSchema, type LoginInput, type SignupInput } from '@talented/shared';
import { ErrorBox, Field } from '../components/ui';
import { errorMessage, fieldErrors } from '../lib/api';
import { useAuth } from '../lib/auth';

function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto mt-10 max-w-md card p-8">
      <h1 className="mb-6 text-2xl font-bold">{title}</h1>
      {children}
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/';
  const [error, setError] = useState('');
  const { register, handleSubmit, formState } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  return (
    <AuthCard title="Log in">
      <form
        className="space-y-4"
        onSubmit={handleSubmit(async (values) => {
          setError('');
          try {
            await login(values);
            navigate(from, { replace: true });
          } catch (err) {
            setError(errorMessage(err));
          }
        })}
      >
        {error && <ErrorBox message={error} />}
        <Field label="Email" error={formState.errors.email?.message}>
          <input className="input" type="email" autoComplete="email" {...register('email')} />
        </Field>
        <Field label="Password" error={formState.errors.password?.message}>
          <input className="input" type="password" autoComplete="current-password" {...register('password')} />
        </Field>
        <button className="btn-primary w-full" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? 'Logging in...' : 'Log in'}
        </button>
        <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          Demo: educator@talented.dev or student@talented.dev, password Password123
        </p>
        <p className="text-center text-sm text-slate-500">
          New here?{' '}
          <Link to="/signup" className="font-medium text-brand-600">
            Create an account
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}

export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const { register, handleSubmit, formState, setError: setFieldError } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { role: 'STUDENT' },
  });

  return (
    <AuthCard title="Create your account">
      <form
        className="space-y-4"
        onSubmit={handleSubmit(async (values) => {
          setError('');
          try {
            const user = await signup(values);
            navigate(user.role === 'EDUCATOR' ? '/educator' : '/');
          } catch (err) {
            // Map server field errors onto the form, same names as the shared schema
            Object.entries(fieldErrors(err)).forEach(([name, msgs]) =>
              setFieldError(name as keyof SignupInput, { message: msgs[0] }),
            );
            setError(errorMessage(err));
          }
        })}
      >
        {error && <ErrorBox message={error} />}
        <Field label="Full name" error={formState.errors.name?.message}>
          <input className="input" autoComplete="name" {...register('name')} />
        </Field>
        <Field label="Email" error={formState.errors.email?.message}>
          <input className="input" type="email" autoComplete="email" {...register('email')} />
        </Field>
        <Field label="Password" error={formState.errors.password?.message}>
          <input className="input" type="password" autoComplete="new-password" {...register('password')} />
        </Field>
        <Field label="I want to">
          <select className="input" {...register('role')}>
            <option value="STUDENT">Learn</option>
            <option value="EDUCATOR">Teach</option>
          </select>
        </Field>
        <button className="btn-primary w-full" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? 'Creating account...' : 'Sign up'}
        </button>
      </form>
    </AuthCard>
  );
}
