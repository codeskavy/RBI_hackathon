import { SuiClient } from '@mysten/sui/client';
import dotenv from 'dotenv';

dotenv.config();

export const suiClient = new SuiClient({ 
  url: process.env.FULLNODE_URL || 'https://fullnode.devnet.sui.io' 
});



export const config = {
  port: process.env.PORT || 3001,
  CLIENT_ID: process.env.VITE_GOOGLE_CLIENT_ID || '855167586739-dre4s1951mp2fjuripfb8omv8vumvgar.apps.googleusercontent.com',
  fullnodeUrl: process.env.FULLNODE_URL || 'https://fullnode.devnet.sui.io',
  proverUrl: process.env.PROVER_URL || 'https://prover-dev.mystenlabs.com/v1',
  saltServiceUrl: process.env.SALT_SERVICE_URL || 'https://salt.api.mystenlabs.com/get_salt',
  jwt_token:process.env.JWT_SECRET||'default_secret'
};
console.log('=== Sui Config ===');
console.log('Fullnode URL:', config.fullnodeUrl);
console.log('Prover URL:', config.proverUrl);
console.log('Salt Service URL:', config.saltServiceUrl);
console.log('Jwt',config.jwt_token);