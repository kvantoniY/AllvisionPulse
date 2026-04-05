import { redirect } from 'next/navigation';

export default function ProgramRunRoute({ params }: { params: { runId: string } }) {
  redirect(`/health?tab=programs&programScreen=run&runId=${encodeURIComponent(params.runId)}`);
}
