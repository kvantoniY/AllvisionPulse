import { AppShell } from '@/widgets/appShell/ui/AppShell';
import { AuthGate } from '@/widgets/appShell/ui/AuthGate';
import { RealtimeProvider } from '@/app/providers/RealtimeProvider';
import { CallProvider } from '@/app/providers/CallProvider';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <RealtimeProvider>
        <CallProvider>
          <AppShell>{children}</AppShell>
        </CallProvider>
      </RealtimeProvider>
    </AuthGate>
  );
}
