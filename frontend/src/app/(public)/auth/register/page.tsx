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
      .refine((value) => value.length === 0 || z.string().email().safeParse(value).success, 'Введите корректную почту'),
    username: z.string().trim().min(1, 'Введите имя пользователя'),
    password: z.string().min(1, 'Введите пароль'),
    confirm: z.string().min(1, 'Подтвердите пароль'),
  })
  .refine((values) => values.password === values.confirm, {
    path: ['confirm'],
    message: 'Пароли не совпадают',
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'data' in error) {
    const data = error.data as { message?: string; error?: { message?: string } } | undefined;
    return data?.message ?? data?.error?.message ?? fallback;
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
        message: getErrorMessage(error, 'Не удалось зарегистрироваться'),
      });
    }
  });

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.head}>Создать аккаунт</div>
        <div className={styles.sub}>Добро пожаловать в Allvision Pulse</div>

        <form onSubmit={onSubmit} className={styles.form}>
          <InputField
            label="Почта (необязательно)"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <InputField
            label="Имя пользователя"
            autoComplete="username"
            error={errors.username?.message}
            {...register('username')}
          />
          <InputField
            label="Пароль"
            type="password"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register('password')}
          />
          <InputField
            label="Подтверждение пароля"
            type="password"
            autoComplete="new-password"
            error={errors.confirm?.message}
            {...register('confirm')}
          />
          {errors.root?.message ? <div className={styles.error}>{errors.root.message}</div> : null}
          <Button type="submit" variant="primary" className={styles.full} disabled={isLoading}>
            {isLoading ? 'Создаём…' : 'Создать аккаунт'}
          </Button>
        </form>

        <div className={styles.bottom}>
          <span>Уже есть аккаунт?</span>
          <Link href={ROUTES.auth.login} className={styles.link}>Войти</Link>
        </div>
      </div>
    </div>
  );
}
