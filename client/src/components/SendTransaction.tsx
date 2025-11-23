import { useState } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { executeZkLoginTransaction } from '../utils/zklogin.utils';

interface TransactionState {
  loading: boolean;
  result: any | null;
  error: string | null;
}

export default function SendTransaction() {
  const [state, setState] = useState<TransactionState>({
    loading: false,
    result: null,
    error: null
  });

  const handleSendTransaction = async () => {
    setState({ loading: true, result: null, error: null });

    try {
      // Create a simple transaction (example: split coins)
      const txb = new Transaction();
      
      // Example: Split 1000 MIST from gas coin
      const [coin] = txb.splitCoins(txb.gas, [1000]);
      
      // Transfer to self (just for demo purposes)
      // In production, you'd transfer to an actual recipient address
      txb.transferObjects([coin], txb.pure.address('0x0'));

      // Execute with zkLogin
      const txResult = await executeZkLoginTransaction(txb);
      
      setState({ 
        loading: false, 
        result: txResult, 
        error: null 
      });
    } catch (err) {
      setState({ 
        loading: false, 
        result: null, 
        error: err instanceof Error ? err.message : 'Transaction failed' 
      });
    }
  };

  return (
    <div style={{ padding: '20px', border: '1px solid #ccc', borderRadius: '8px', marginTop: '20px' }}>
      <h2>Send Transaction</h2>
      <p>Execute a test transaction using zkLogin signature</p>
      
      <button 
        onClick={handleSendTransaction} 
        disabled={state.loading}
        style={{
          padding: '12px 24px',
          background: state.loading ? '#ccc' : '#28a745',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: state.loading ? 'not-allowed' : 'pointer',
          fontSize: '16px'
        }}
      >
        {state.loading ? '⏳ Sending...' : '📤 Send Test Transaction'}
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
      
      {state.result && (
        <div style={{ 
          marginTop: '15px', 
          padding: '15px', 
          background: '#efe', 
          borderRadius: '4px'
        }}>
          <h3>✅ Transaction Success!</h3>
          <div style={{ marginTop: '10px' }}>
            <strong>Digest:</strong>
            <div style={{ 
              padding: '8px', 
              background: '#fff', 
              borderRadius: '4px',
              fontFamily: 'monospace',
              wordBreak: 'break-all',
              marginTop: '5px'
            }}>
              {state.result.digest}
            </div>
          </div>
          <a 
            href={`https://suiscan.xyz/devnet/tx/${state.result.digest}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ 
              display: 'inline-block',
              marginTop: '10px',
              color: '#007bff',
              textDecoration: 'none'
            }}
          >
            View on Sui Explorer →
          </a>
        </div>
      )}
    </div>
  );
}