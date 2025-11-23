import { SuiClient } from '@mysten/sui/client';

export const suiClient = new SuiClient({ 
  url: import.meta.env.VITE_FULLNODE_URL 
});

export const REDIRECT_URL = import.meta.env.VITE_REDIRECT_URL;
export const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
export const API_URL = import.meta.env.VITE_API_URL;