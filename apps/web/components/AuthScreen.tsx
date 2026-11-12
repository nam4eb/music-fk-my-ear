'use client';
import { useState, type FormEvent } from 'react';
import { Disc3, Headphones, LockKeyhole, Mail, ArrowRight, LoaderCircle } from 'lucide-react';
import { api, json, setToken, type AppConfig, type AuthResult } from '@/lib/http';
import type { UiLanguage } from '@/lib/labels';
import { UI } from '@/lib/labels';
export default function AuthScreen({ config, lang, onLogin }: { config: AppConfig; lang: UiLanguage; onLogin: (result: AuthResult) => void }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [setupToken, setSetupToken] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const t = UI[lang];
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const body = config.needsSetup ? { email, password, setupToken } : { email, password };
      const route = config.needsSetup ? '/api/auth/setup' : '/api/auth/login';
      const result = await api<AuthResult>(route, json(body));
      setToken(result.token); onLogin(result);
    } catch (err) { setError(err instanceof Error ? err.message : 'Request failed'); }
    finally { setBusy(false); }
  };
  return <main className="auth-page min-h-dvh flex items-center justify-center p-4 sm:p-8">
    <div className="auth-card w-full max-w-[420px] rounded-[30px] border border-white/10 bg-[#1a1b2c]/95 p-7 shadow-2xl sm:p-10">
      <div className="mb-8 flex items-center gap-3"><div className="rounded-2xl bg-[#8b5cf6] p-3"><Disc3 className="h-7 w-7" /></div><div><h1 className="text-2xl font-black tracking-tight">vibe<span className="text-[#a994ff]">box</span></h1><p className="text-xs text-[#9c9cb5]">YOUR MUSIC, YOUR MOOD</p></div></div>
      <span className="inline-flex items-center gap-2 rounded-full border border-[#aa97ff]/25 bg-[#aa97ff]/10 px-3 py-1.5 text-xs font-semibold text-[#cabfff]"><LockKeyhole className="h-3.5 w-3.5" /> PRIVATE MUSIC LIBRARY</span>
      <h2 className="mt-6 text-[29px] font-bold tracking-tight leading-tight">{config.needsSetup ? t.setup : t.signIn}</h2>
      <p className="mt-3 mb-7 text-sm leading-relaxed text-[#acaec5]">{t.loginHint}</p>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm text-[#e7e5f5]">{t.email}<div className="relative mt-2"><Mail className="absolute left-4 top-3.5 h-4 w-4 text-[#8d8ea9]"/><input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" className="form-input pl-11" autoComplete="email" /></div></label>
        <label className="block text-sm text-[#e7e5f5]">{t.password}<div className="relative mt-2"><Headphones className="absolute left-4 top-3.5 h-4 w-4 text-[#8d8ea9]"/><input required minLength={config.needsSetup ? 12 : 1} type="password" value={password} onChange={e=>setPassword(e.target.value)} className="form-input pl-11" autoComplete={config.needsSetup ? 'new-password' : 'current-password'} /></div></label>
        {config.needsSetup && <label className="block text-sm text-[#e7e5f5]">{t.setupToken}<input required value={setupToken} onChange={e=>setSetupToken(e.target.value)} type="password" className="form-input mt-2" autoComplete="off" /></label>}
        {error && <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>}
        <button disabled={busy} className="btn-primary mt-3 w-full justify-center py-3.5" type="submit">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}{config.needsSetup ? t.setup : t.signIn}</button>
      </form>
      <p className="mt-7 text-center text-xs text-[#85869d]">VibeBox v2.0 • Next.js + PostgreSQL + R2</p>
    </div>
  </main>;
}
