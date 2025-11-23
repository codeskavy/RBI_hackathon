import { useState, useEffect } from 'react';
import ZkLoginAuth from './components/ZkLoginAuth';
import SendTransaction from './components/SendTransaction';
import { isZkLoginSessionActive } from './utils/zklogin.utils';
import './App.css';

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // Check login status on mount and update periodically
    const checkLoginStatus = () => {
      setIsLoggedIn(isZkLoginSessionActive());
    };

    checkLoginStatus();
    
    // Re-check every second to update UI when login state changes
    const interval = setInterval(checkLoginStatus, 1000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '40px 20px' }}>
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '10px' }}>
          🔐 Make your own wallet 
        </h1>
        <p style={{ color: '#666', fontSize: '1.1rem' }}>
          Authenticate with Google OAuth and interact with Sui blockchain
        </p>
      </div>
      
      <ZkLoginAuth />
      
      {isLoggedIn && (
        <>
          <hr style={{ margin: '40px 0', border: 'none', borderTop: '1px solid #ddd' }} />
          <SendTransaction />
        </>
      )}
      
      <div style={{ 
        marginTop: '40px', 
        padding: '20px', 
        background: '#f8f9fa', 
        borderRadius: '8px',
        fontSize: '0.9rem',
        color: '#666'
      }}>
        <h3 style={{ marginTop: 0 }}>📝 How it works:</h3>
      
      </div>
    </div>
  );
}

export default App;