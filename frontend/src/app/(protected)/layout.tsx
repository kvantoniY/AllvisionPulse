import { AppShell } from '@/widgets/appShell/ui/AppShell';
import { AuthGate } from '@/widgets/appShell/ui/AuthGate';
import { AppExperienceProvider } from '@/app/providers/AppExperienceProvider';
import { RealtimeProvider } from '@/app/providers/RealtimeProvider';
import { CallProvider } from '@/app/providers/CallProvider';
import { StoriesProvider } from '@/features/stories';
import { AnalyticsTracker } from '@/app/providers/AnalyticsTracker';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <AppExperienceProvider>
        <RealtimeProvider>
          <CallProvider>
            <StoriesProvider>
              <AnalyticsTracker />
              <AppShell>{children}</AppShell>
            </StoriesProvider>
          </CallProvider>
        </RealtimeProvider>
      </AppExperienceProvider>
    </AuthGate>
  );
}
