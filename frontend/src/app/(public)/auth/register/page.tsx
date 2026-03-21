'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import styles from '../Auth.module.css';
import { useRegisterMutation } from '@/shared/api/authApi';
import { ROUTES } from '@/shared/config/app';
import { zodResolver } from '@/shared/lib/forms/zodResolver';
import { Button } from '@/shared/ui/Button/Button';
import { InputField } from '@/shared/ui/Input/Input';

const registerSchema = z
  .object({
    email: z
      .string()
      .trim()
      .refine((value) => value.length === 0 || z.email().safeParse(value).success, 'Enter a valid email'),
    username: z.string().trim().min(1, 'Enter a username'),
    password: z.string().min(1, 'Enter a password'),
    confirm: z.string().min(1, 'Confirm your password'),
  })
  .refine((values) => values.password === values.confirm, {
    path: ['confirm'],
    message: 'Passwords do not match',
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'data' in error) {
    return (error.data as { message?: string } | undefined)?.message ?? fallback;
  }

  return fallback;
}

export default function RegisterPage() {
  const router = useRouter();
  const [doRegister, { isLoading }] = useRegisterMutation();
  const {
    register,
    handleSubmit,
    clearErrors,
    setError,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      username: '',
      password: '',
      confirm: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    clearErrors('root');
    try {
      await doRegister({
        email: values.email || undefined,
        username: values.username,
        password: values.password,
      }).unwrap();
      router.replace(ROUTES.app.home);
    } catch (error) {
      setError('root', {
        type: 'server',
        message: getErrorMessage(error, 'Registration failed'),
      });
    }
  });

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.head}>Create account</div>
        <div className={styles.sub}>Allvision Pulse MVP</div>

        <form onSubmit={onSubmit} className={styles.form}>
          <InputField
            label="Email (optional)"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <InputField
            label="Username"
            autoComplete="username"
            error={errors.username?.message}
            {...register('username')}
          />
          <InputField
            label="Password"
            type="password"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register('password')}
          />
          <InputField
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            error={errors.confirm?.message}
            {...register('confirm')}
          />
          {errors.root?.message ? <div className={styles.error}>{errors.root.message}</div> : null}
          <Button variant="primary" className={styles.full} disabled={isLoading}>
            {isLoading ? 'Creating...' : 'Create'}
          </Button>
        </form>

        <div className={styles.bottom}>
          <span>Already have an account?</span>
          <Link href={ROUTES.auth.login} className={styles.link}>Sign in</Link>
        </div>
      </div>
    </div>
  );
}
