import { redirect } from 'next/navigation';
import { ROUTES } from '@/shared/config/app';

export default function PulseProPage() {
  redirect(ROUTES.app.pro);
}
