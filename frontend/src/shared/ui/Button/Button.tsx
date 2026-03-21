import { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

type Variant = 'default' | 'primary' | 'ghost';

export function Button({ variant = 'default', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const cn = [styles.btn, variant === 'primary' ? styles.primary : '', variant === 'ghost' ? styles.ghost : '', className]
    .filter(Boolean)
    .join(' ');
  return <button {...props} className={cn} />;
}
