import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';

export default async function Home() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  redirect(user ? '/dashboard' : '/login');
}
