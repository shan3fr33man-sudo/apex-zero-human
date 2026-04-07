import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';

export default async function WelcomeLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/welcome');
  return <>{children}</>;
}
