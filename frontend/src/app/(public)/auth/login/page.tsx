'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import styles from '../Auth.module.css';
import { useLoginMutation } from '@/shared/api/authApi';
import { ROUTES } from '@/shared/config/app';
import { zodResolver } from '@/shared/lib/forms/zodResolver';
import { Button } from '@/shared/ui/Button/Button';
import { InputField } from '@/shared/ui/Input/Input';

const loginSchema = z.object({
  login: z.string().trim().min(1, 'Enter your email or username'),
  password: z.string().min(1, 'Enter your password'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'data' in error) {
    return (error.data as { message?: string } | undefined)?.message ?? fallback;
  }

  return fallback;
}

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next') ?? ROUTES.app.home;
  const [doLogin, { isLoading }] = useLoginMutation();
  const {
    register,
    handleSubmit,
    clearErrors,
    setError,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      login: '',
      password: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    clearErrors('root');
    try {
      await doLogin(values).unwrap();
      router.replace(next);
    } catch (error) {
      setError('root', {
        type: 'server',
        message: getErrorMessage(error, 'Login failed'),
      });
    }
  });

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.head}>Welcome back</div>
        <div className={styles.sub}>Login with your username or email</div>

        <form onSubmit={onSubmit} className={styles.form}>
          <InputField
            label="Email or username"
            autoComplete="username"
            error={errors.login?.message}
            {...register('login')}
          />
          <InputField
            label="Password"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />
          {errors.root?.message ? <div className={styles.error}>{errors.root.message}</div> : null}
          <Button variant="primary" className={styles.full} disabled={isLoading}>
            {isLoading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>

        <div className={styles.bottom}>
          <span>New here?</span>
          <Link href={ROUTES.auth.register} className={styles.link}>Create an account</Link>
        </div>
      </div>
    </div>
  );
}
