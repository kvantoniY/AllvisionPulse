import { redirect } from 'next/navigation';

export default function NewProgramPage() {
  redirect('/health?tab=programs&programScreen=builder');
}
