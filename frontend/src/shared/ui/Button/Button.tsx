import { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';
import { Spinner } from '@/shared/ui/Spinner/Spinner';

type Variant = 'default' | 'primary' | 'ghost';
type Size = 'md' | 'sm';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  iconOnly?: boolean;
  children?: ReactNode;
};

export function Button({
  variant = 'default',
  size = 'md',
  loading = false,
  iconOnly = false,
  className = '',
  type = 'button',
  disabled,
  children,
  ...props
}: Props) {
  const cn = [
    styles.btn,
    variant === 'primary' ? styles.primary : '',
    variant === 'ghost' ? styles.ghost : '',
    size === 'sm' ? styles.small : '',
    iconOnly ? styles.iconOnly : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button {...props} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={cn}>
      {loading ? <Spinner size={16} className={styles.spinner} /> : null}
      {children ? <span className={styles.content}>{children}</span> : null}
    </button>
  );
}
