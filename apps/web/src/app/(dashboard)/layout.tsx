import { redirect } from 'next/navigation';
import { CompanySidebar } from '@/components/CompanySidebar';
import { RightPanel } from '@/components/RightPanel';
import { HelpPanel } from '@/components/HelpPanel';
import { createServerSupabase } from '@/lib/supabase/server';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard');

  return (
    <div className="flex h-screen bg-apex-bg overflow-hidden">
      {/* LEFT: Company sidebar (240px fixed) */}
      <CompanySidebar />

      {/* CENTER: Main content (flex-1, scrollable) */}
      <main className="flex-1 overflow-auto">{children}</main>

      {/* RIGHT: CommandBar + Activity Feed (320px fixed) */}
      <RightPanel />

      {/* Floating help button (bottom-right) */}
      <HelpPanel />
    </div>
  );
}
