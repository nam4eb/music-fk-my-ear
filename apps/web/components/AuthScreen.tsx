'use client';
import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { Disc3, LockKeyhole, LoaderCircle, ShieldCheck } from 'lucide-react';
import { api, json, setToken, type AppConfig, type AuthResult } from '@/lib/http';
import type { UiLanguage } from '@/lib/labels';

type GoogleCredentialResponse = { credential?: string };
type GoogleIdentity = {
  accounts: {
    id: {
      initialize: (options: { client_id: string; callback: (response: GoogleCredentialResponse) => void; auto_select?: boolean }) => void;
      renderButton: (element: HTMLElement, options: { theme: string; size: string; shape: string; text: string; width: number }) => void;
      cancel: () => void;
      disableAutoSelect: () => void;
    }
  }
};
declare global { interface Window { google?: GoogleIdentity } }

export default function AuthScreen({ config, lang, onLogin }: { config: AppConfig; lang: UiLanguage; onLogin: (result: AuthResult) => void }) {
  const [sdkReady, setSdkReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const buttonRef = useRef<HTMLDivElement>(null);
  const onLoginRef = useRef(onLogin);
  onLoginRef.current = onLogin;
  const vi = lang === 'vi';

  useEffect(() => {
    if (!sdkReady || !window.google || !buttonRef.current) return;
    const identity = window.google.accounts.id;
    let alive = true;
    identity.initialize({
      client_id: config.googleClientId,
      auto_select: false,
      callback: async ({ credential }) => {
        if (!alive) return;
        if (!credential) {
          setError(vi ? 'Google không trả về thông tin đăng nhập.' : 'No credential returned by Google.');
          return;
        }
        setBusy(true);
        setError('');
        try {
          const result = await api<AuthResult>('/api/auth/google', json({ credential }));
          if (!alive) return;
          setToken(result.token);
          onLoginRef.current(result);
        } catch (err) {
          if (alive) setError(err instanceof Error ? err.message : 'Google sign-in failed');
        } finally {
          if (alive) setBusy(false);
        }
      }
    });
    buttonRef.current.replaceChildren();
    identity.renderButton(buttonRef.current, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', width: 300 });
    return () => { alive = false; identity.cancel(); };
  }, [sdkReady, config.googleClientId, vi]);

  return <main className="auth-page min-h-dvh flex items-center justify-center p-4 sm:p-8">
    <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive"
      onReady={() => setSdkReady(true)}
      onError={() => setError(vi ? 'Không tải được Google Sign-In. Kiểm tra kết nối hoặc trình chặn quảng cáo.' : 'Unable to load Google Sign-In. Check connection or content blockers.')} />
    <div className="auth-card w-full max-w-[420px] rounded-[30px] border border-white/10 bg-[#162923]/95 p-7 shadow-2xl sm:p-10">
      <div className="mb-8 flex items-center gap-3"><div className="rounded-2xl bg-[#20534a] p-3"><Disc3 className="h-7 w-7" /></div><div><h1 className="text-2xl font-black tracking-tight">music <span className="text-[#6ac6bc]">fuq me</span></h1><p className="text-xs text-[#66bcb5]">YOUR MUSIC, YOUR MOOD</p></div></div>
      <span className="inline-flex items-center gap-2 rounded-full border border-[#ccfff9]/25 bg-[#ccfff9]/10 px-3 py-1.5 text-xs font-semibold text-[#ccfffa]"><LockKeyhole className="h-3.5 w-3.5" /> PRIVATE MUSIC LIBRARY</span>
      <h2 className="mt-6 text-[29px] font-bold tracking-tight leading-tight">{config.needsSetup ? (vi ? 'Tạo thư viện với Google' : 'Create your music library') : (vi ? 'Đăng nhập Music Fuq Me' : 'Sign in to Music Fuq Me')}</h2>
      <p className="mt-3 mb-7 text-sm leading-relaxed text-[#6fcdc5]">{vi ? 'Chỉ tài khoản Google chủ sở hữu được cấp quyền mới truy cập được thư viện nhạc riêng tư.' : 'Only the configured Google owner account can access your private music library.'}</p>
      <div className="min-h-[56px] flex flex-col items-center justify-center gap-3" aria-busy={busy}>
        <div ref={buttonRef} className={busy ? 'pointer-events-none opacity-50' : ''} aria-label="Continue with Google" />
        {(!sdkReady || busy) && <span className="inline-flex items-center gap-2 text-xs text-[#a9c9c0]"><LoaderCircle className="h-4 w-4 animate-spin" />{busy ? (vi ? 'Đang xác minh tài khoản…' : 'Verifying account…') : (vi ? 'Đang tải Google Sign-In…' : 'Loading Google Sign-In…')}</span>}
      </div>
      {error && <div role="alert" className="mt-5 rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
      <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-[#84a69c]"><ShieldCheck size={15} />{vi ? 'Không cần mật khẩu hoặc Setup Token' : 'No app password or setup token required'}</p>
      <p className="mt-4 text-center text-xs text-[#84a69c]">Music Fuq Me 2.2 • Next.js + PostgreSQL + Google</p>
    </div>
  </main>;
}
