import { redirect } from 'next/navigation';

export default function ProgramDetailRoute({ params }: { params: { programId: string } }) {
  redirect(`/health?tab=programs&programScreen=detail&programId=${encodeURIComponent(params.programId)}`);
}
