# Google OAuth Setup for APEX

## Step 1: Create Google Cloud OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use existing): **APEX**
3. Go to **APIs & Services → Credentials**
4. Click **+ CREATE CREDENTIALS → OAuth client ID**
5. If prompted, configure the OAuth consent screen:
   - User Type: **External**
   - App name: **APEX**
   - User support email: your email
   - Authorized domains: `apex-code.tech`
   - Developer contact: your email
6. Create OAuth 2.0 Client ID:
   - Application type: **Web application**
   - Name: **APEX Web**
   - Authorized JavaScript origins:
     - `https://apex-code.tech`
   - Authorized redirect URIs:
     - `https://twsgkmzsayyryqxzfryd.supabase.co/auth/v1/callback`
7. Copy the **Client ID** and **Client Secret**

## Step 2: Enable Google in Supabase

1. Go to [Supabase Auth Providers](https://supabase.com/dashboard/project/twsgkmzsayyryqxzfryd/auth/providers)
2. Scroll to **Google** → Click to expand
3. Toggle **Google enabled** ON
4. Paste your **Client ID** and **Client Secret**
5. Click **Save**

## Step 3: Configure Redirect URLs

1. In Supabase, go to **Authentication → URL Configuration**
2. Set **Site URL** to: `https://apex-code.tech`
3. Add to **Redirect URLs**:
   - `https://apex-code.tech/auth/callback`
   - `https://apex-code.tech/**`
4. Click **Save**

## Step 4: Test

1. Go to `https://apex-code.tech/login`
2. Click **Continue with Google**
3. Sign in with your Google account
4. You should be redirected to `/onboarding` (first time) or `/dashboard`

## How It Works

- Login/Signup pages have "Continue with Google" button
- Supabase handles the OAuth flow with Google
- `/auth/callback` route exchanges the code for a session
- For new users: auto-creates organization + membership
- `handle_new_user` trigger creates the public.users row with Google profile data
