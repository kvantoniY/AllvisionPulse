import { redirect } from 'next/navigation';

export default function ProgramSessionRoute({ params }: { params: { sessionId: string } }) {
  redirect(`/health?tab=programs&programScreen=session&sessionId=${encodeURIComponent(params.sessionId)}`);
}
