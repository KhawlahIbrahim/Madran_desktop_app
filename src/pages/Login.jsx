import { useEffect, useState } from 'react';

// Electron wraps a thrown IPC error as "Error invoking remote method 'x': Error: <msg>".
// Strip that so the Chief just sees the message.
function cleanMessage(raw, fallback) {
  if (!raw) return fallback;
  return raw.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^Error:\s*/, '') || fallback;
}

export default function Login({ onSignedIn }) {
  const [mode, setMode] = useState('signin'); // signin | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cloudReady, setCloudReady] = useState(null);

  useEffect(() => {
    window.madran.cloud.isConfigured().then(setCloudReady);
  }, []);

  const signingUp = mode === 'signup';

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      let leader;
      if (signingUp) {
        if (cloudReady) {
          // Preferred path: register the Chief account online (Firebase Auth).
          // main.js falls back to a local account only if the network is down.
          leader = await window.madran.cloud.signUp(email, password, name || email);
        } else {
          // No Firebase configured on this laptop yet — create the Chief locally.
          leader = await window.madran.leader.save({ name: name || email || 'Chief', email, tabletDeviceId: null });
          leader.offlineFallback = true;
        }
      } else if (cloudReady) {
        leader = await window.madran.cloud.signIn(email, password);
      } else {
        leader = await window.madran.leader.save({ name: name || email || 'Chief', email, tabletDeviceId: null });
      }

      if (leader.offlineFallback) {
        setNotice(
          signingUp
            ? 'Registered on this laptop for now — connect to the internet later to finish online registration.'
            : 'Signed in offline from this laptop’s saved account.'
        );
        setTimeout(() => onSignedIn(leader), 1200);
      } else {
        onSignedIn(leader);
      }
    } catch (err) {
      const message = cleanMessage(err.message, signingUp ? 'Could not create account' : 'Could not sign in');
      setError(message);
      // The account already exists — move them to the sign-in form automatically.
      if (signingUp && /already exists/i.test(message)) setMode('signin');
    } finally {
      setBusy(false);
    }
  }

  async function handleForgotPassword() {
    setError(null);
    setNotice(null);
    if (!email.trim()) {
      setError('Enter your email above first, then click “Forgot password?”.');
      return;
    }
    setBusy(true);
    try {
      await window.madran.cloud.resetPassword(email.trim());
      setNotice(`Password reset link sent to ${email.trim()}. Check your inbox (and spam).`);
    } catch (err) {
      setError(cleanMessage(err.message, 'Could not send the reset email.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <img className="login-brand-logo" src="/logo.png" alt="SINMAR — Safety Intelligent Network for Monitoring & Advanced Response" />
        </div>

        <h1>MADRAN Control</h1>
        <p className="login-tagline">
          {signingUp
            ? 'Create a Chief account. Firefighters never sign in — this application has exactly one human user.'
            : 'Sign in as Chief. Firefighters never sign in — this application has exactly one human user.'}
        </p>

        {cloudReady === false && (
          <div className="login-notice">
            Cloud sync isn't configured on this laptop yet, so registration and sign-in are local-only
            for now. See the README to connect Firebase — nothing here is blocked by that.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {(!cloudReady || signingUp) && (
            <label>
              Your name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ibrahim Salem" />
            </label>
          )}
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="chief@department.gov" required />
          </label>
          {cloudReady && (
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={signingUp ? 'At least 6 characters' : undefined}
                autoComplete={signingUp ? 'new-password' : 'current-password'}
                minLength={signingUp ? 6 : undefined}
                required
              />
            </label>
          )}
          {cloudReady && !signingUp && (
            <button type="button" className="login-link login-forgot" onClick={handleForgotPassword} disabled={busy}>
              Forgot password?
            </button>
          )}
          {notice && <div className="login-notice">{notice}</div>}
          {error && <div className="login-error">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy
              ? (signingUp ? 'Creating account…' : 'Signing in…')
              : (signingUp ? 'Create account' : 'Enter MADRAN')}
          </button>
        </form>

        <p className="login-switch">
          {signingUp ? 'Already have a Chief account?' : 'Need a Chief account?'}{' '}
          <button
            type="button"
            className="login-link"
            onClick={() => { setMode(signingUp ? 'signin' : 'signup'); setError(null); setNotice(null); }}
          >
            {signingUp ? 'Sign in' : 'Register'}
          </button>
        </p>
      </div>
    </div>
  );
}
