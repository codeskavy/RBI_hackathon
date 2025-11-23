import { useState, useEffect } from 'react';
import { 
  prepareLogin, 
  completeZkLogin, 
  isZkLoginSessionActive, 
  getZkLoginAddress, 
  zkLoginLogout,
  getDecodedJwt,
  recoverSaltFromStorage
} from '../utils/zklogin.utils';
import type { ZkLoginState } from '../types/zklogin.types';

export default function ZkLoginAuth() {
  const [state, setState] = useState<ZkLoginState>({
    isLoggedIn: false,
    address: null,
    loading: false,
    error: null
  });

  useEffect(() => {
    // Check if already logged in
    if (isZkLoginSessionActive()) {
      setState({
        isLoggedIn: true,
        address: getZkLoginAddress(),
        loading: false,
        error: null
      });
    }

    // Handle OAuth callback
    const handleCallback = async () => {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const idToken = params.get('id_token');

      if (idToken) {
        setState(prev => ({ ...prev, loading: true, error: null }));
        
        try {
          const { zkLoginUserAddress } = await completeZkLogin(idToken);
          
          setState({
            isLoggedIn: true,
            address: zkLoginUserAddress,
            loading: false,
            error: null
          });
          
          // Clear URL params
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (err) {
          setState({
            isLoggedIn: false,
            address: null,
            loading: false,
            error: err instanceof Error ? err.message : 'Login failed'
          });
        }
      }
    };

    handleCallback();
  }, []);

  const handleLogin = async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const authUrl = await prepareLogin();
      window.location.href = authUrl;
    } catch (err) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to prepare login'
      }));
    }
  };

  const handleLogout = () => {
    zkLoginLogout();
    setState({
      isLoggedIn: false,
      address: null,
      loading: false,
      error: null
    });
  };

  if (state.loading) {
    return (
      <div style={{ padding: '20px' }}>
        <h2>Loading zkLogin...</h2>
        <p>Please wait while we authenticate you...</p>
      </div>
    );
  }

  if (state.isLoggedIn && state.address) {
    const jwt = getDecodedJwt();
    const recoveredSalt = jwt?.sub ? recoverSaltFromStorage(jwt.sub) : null;
    
    return (
      <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '8px' }}>
        <h2>✅ Logged In</h2>
        <div style={{ marginTop: '10px' }}>
          <strong>Your Sui Address:</strong>
          <div style={{ 
            padding: '10px', 
            background: '#f5f5f5', 
            borderRadius: '4px', 
            fontFamily: 'monospace',
            wordBreak: 'break-all',
            marginTop: '5px'
          }}>
            {state.address}
          </div>
        </div>
        
        {jwt?.sub && (
          <div style={{ marginTop: '10px' }}>
            <strong>Google ID:</strong> {jwt.sub}
          </div>
        )}

        {recoveredSalt && (
          <div style={{ 
            marginTop: '15px', 
            padding: '10px', 
            background: '#e7f3ff',
            borderRadius: '4px',
            borderLeft: '4px solid #2196F3'
          }}>
            <strong>💾 Salt Backup Saved</strong>
            <p style={{ margin: '5px 0 0 0', fontSize: '12px' }}>
              Your wallet recovery salt is stored locally on this device.
              Check your email for a backup copy.
            </p>
          </div>
        )}
        
        <button 
          onClick={handleLogout}
          style={{
            marginTop: '15px',
            padding: '10px 20px',
            background: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Logout
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <h2>zkLogin Authentication</h2>
      <p>Login with Google using zkLogin to get your Sui address</p>
      
      <button 
        onClick={handleLogin} 
        disabled={state.loading}
        style={{
          padding: '12px 24px',
          background: '#4285f4',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: state.loading ? 'not-allowed' : 'pointer',
          fontSize: '16px'
        }}
      >
        {state.loading ? 'Loading...' : '🔐 Login with Google'}
      </button>
      
      {state.error && (
        <div style={{ 
          marginTop: '15px', 
          padding: '10px', 
          background: '#fee', 
          color: '#c00',
          borderRadius: '4px'
        }}>
          <strong>Error:</strong> {state.error}
        </div>
      )}
    </div>
  );
}