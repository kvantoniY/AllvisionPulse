import { forwardRef, type InputHTMLAttributes } from 'react';
import styles from './Input.module.css';

type InputFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string | null;
};

export const InputField = forwardRef<HTMLInputElement, InputFieldProps>(function InputField(
  { label, error, className, ...props },
  ref,
) {
  return (
    <label className={styles.field}>
      {label ? <span className={styles.label}>{label}</span> : null}
      <input {...props} ref={ref} className={[styles.input, className].filter(Boolean).join(' ')} />
      {error ? <span className={styles.error}>{error}</span> : null}
    </label>
  );
});
