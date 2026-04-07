import { redirect } from 'next/navigation';

// /onboarding is the legacy first-run path. The real wizard lives at /welcome.
// This redirect keeps old links and the auth-callback fallback working.
export default function OnboardingRedirect() {
  redirect('/welcome');
}
