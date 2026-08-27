import { useEffect, useState } from 'react';

export default function Login({ onSignedIn }) {
  const [mode, setMode] = useState('signin'); // signin | signup
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cloudReady, setCloudReady] = useState(null);

  useEffect(() => {
    window.madran.cloud.isConfigured().then(setCloudReady);
  }, []);

  const signingUp = cloudReady && mode === 'signup';

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (signingUp) {
        const leader = await window.madran.cloud.signUp(email, password, name || email);
        onSignedIn(leader);
      } else if (cloudReady) {
        const leader = await window.madran.cloud.signIn(email, password);
        onSignedIn(leader);
      } else {
        // Firebase not configured yet — still let the Chief work locally.
        const leader = await window.madran.leader.save({ name: name || email || 'Chief', email, tabletDeviceId: null });
        onSignedIn(leader);
      }
    } catch (err) {
      setError(err.message || (signingUp ? 'Could not create account' : 'Could not sign in'));
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
            Cloud sync isn't configured yet, so this session will run fully offline and local-only.
            See the README to connect Firebase later — nothing here is blocked by that.
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
                required
              />
            </label>
          )}
          {error && <div className="login-error">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy
              ? (signingUp ? 'Creating account…' : 'Signing in…')
              : (signingUp ? 'Create account' : 'Enter MADRAN')}
          </button>
        </form>

        {cloudReady && (
          <p className="login-switch">
            {signingUp ? 'Already have a Chief account?' : 'Need a Chief account?'}{' '}
            <button
              type="button"
              className="login-link"
              onClick={() => { setMode(signingUp ? 'signin' : 'signup'); setError(null); }}
            >
              {signingUp ? 'Sign in' : 'Create one'}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
