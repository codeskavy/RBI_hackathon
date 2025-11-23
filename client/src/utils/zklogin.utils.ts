import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
  generateNonce,
  generateRandomness,
  jwtToAddress,
  getExtendedEphemeralPublicKey,
  genAddressSeed,
  getZkLoginSignature
} from '@mysten/sui/zklogin';
import { Transaction } from '@mysten/sui/transactions';
import { jwtDecode } from 'jwt-decode';
import { suiClient, REDIRECT_URL, CLIENT_ID, API_URL } from '../config/sui.config';
import type {
  JwtPayload,
  EpochInfo,
  PartialZkLoginSignature
} from '../types/zklogin.types';

// Session storage keys
const SESSION_KEYS = {
  EPHEMERAL_PRIVATE_KEY: 'ephemeral_private_key',
  MAX_EPOCH: 'max_epoch',
  RANDOMNESS: 'randomness',
  NONCE: 'nonce',
  ZK_PROOF: 'zk_proof',
  USER_SALT: 'user_salt',
  DECODED_JWT: 'decoded_jwt',
  ZKLOGIN_ADDRESS: 'zklogin_address',
  SALT_BACKUP_SENT: 'salt_backup_sent'
} as const;

/**
 * Step 1: prepare login (generate ephemeral key + nonce) and return Google OAuth URL
 */
export async function prepareLogin(): Promise<string> {
  try {
    // Get current epoch from backend
    const response = await fetch(`${API_URL}/zklogin/epoch`);
    if (!response.ok) {
      throw new Error('Failed to fetch epoch info');
    }
    const epochInfo: EpochInfo = await response.json();
    const maxEpoch = Number(epochInfo.epoch) + 2;

    // Generate ephemeral key pair
    const ephemeralKeyPair = new Ed25519Keypair();

    // Get the secret key in bech32 string form and store it
    // (Ed25519Keypair.getSecretKey() returns a bech32 string in typical SDKs)
    const ephemeralSecretKey = ephemeralKeyPair.getSecretKey();
    sessionStorage.setItem(SESSION_KEYS.EPHEMERAL_PRIVATE_KEY, ephemeralSecretKey);

    // Generate randomness and nonce
    const randomness = generateRandomness();
    const nonce = generateNonce(
      ephemeralKeyPair.getPublicKey(),
      maxEpoch,
      randomness
    );

    console.log('=== Preparing Login ===');
    console.log('Max Epoch:', maxEpoch);
    console.log('Randomness:', randomness);
    console.log('Nonce:', nonce);

    // Store other session values
    sessionStorage.setItem(SESSION_KEYS.MAX_EPOCH, maxEpoch.toString());
    sessionStorage.setItem(SESSION_KEYS.RANDOMNESS, randomness);
    sessionStorage.setItem(SESSION_KEYS.NONCE, nonce);

    // Construct Google OAuth URL
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    console.log('OAuth Config:', {
      clientId: CLIENT_ID,
      redirectUrl: REDIRECT_URL,
      nonce
    });
    authUrl.searchParams.append('client_id', CLIENT_ID);
    authUrl.searchParams.append('response_type', 'id_token');
    authUrl.searchParams.append('redirect_uri', REDIRECT_URL);
    authUrl.searchParams.append('scope', 'openid');
    authUrl.searchParams.append('nonce', nonce);

    return authUrl.toString();
  } catch (error) {
    console.error('Error preparing login:', error);
    throw new Error(
      `Failed to prepare login: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Step 2: Handle OAuth callback and complete zkLogin setup
 */
export async function completeZkLogin(encodedJWT: string): Promise<{
  zkLoginUserAddress: string;
  decodedJwt: JwtPayload;
}> {
  try {
    // Decode JWT
    const decodedJwt = jwtDecode<JwtPayload>(encodedJWT);
    console.log('Decoded JWT aud:', decodedJwt.aud);
    console.log('Full decoded JWT claims:', decodedJwt);
    console.log('JWT nonce:', decodedJwt.nonce);

    // Get stored session values
    const ephemeralPrivateKeyStr = sessionStorage.getItem(SESSION_KEYS.EPHEMERAL_PRIVATE_KEY);
    const maxEpoch = sessionStorage.getItem(SESSION_KEYS.MAX_EPOCH);
    const randomness = sessionStorage.getItem(SESSION_KEYS.RANDOMNESS);
    const storedNonce = sessionStorage.getItem(SESSION_KEYS.NONCE);

    if (!ephemeralPrivateKeyStr || !maxEpoch || !randomness) {
      throw new Error('Missing session data. Please login again.');
    }

    console.log('=== Session Data ===');
    console.log('Stored Nonce:', storedNonce);
    console.log('JWT Nonce:', decodedJwt.nonce);
    console.log('Max Epoch:', maxEpoch);
    console.log('Randomness:', randomness);

    // Verify nonce matches
    if (storedNonce !== decodedJwt.nonce) {
      console.error('Nonce mismatch!');
      throw new Error('Nonce mismatch. Please try logging in again.');
    }

    // Recreate ephemeral keypair using the bech32 secret key string
    // Ed25519Keypair.fromSecretKey accepts either a bech32 string or Uint8Array depending on SDK
    const ephemeralKeyPair = Ed25519Keypair.fromSecretKey(ephemeralPrivateKeyStr);

    // Verify the recreated keypair generates the same nonce
    const verifyNonce = generateNonce(
      ephemeralKeyPair.getPublicKey(),
      Number(maxEpoch),
      randomness
    );

    console.log('=== Nonce Verification ===');
    console.log('Original Nonce:', storedNonce);
    console.log('Recreated Nonce:', verifyNonce);
    console.log('JWT Nonce:', decodedJwt.nonce);

    if (verifyNonce !== decodedJwt.nonce) {
      console.error('Failed to recreate matching nonce!');
      throw new Error('Ephemeral key mismatch. Please try logging in again.');
    }

    // Get user salt from backend
    const saltResponse = await fetch(`${API_URL}/zklogin/salt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        token: encodedJWT
      })
    });

    let userSalt: string;
    if (saltResponse.ok) {
      const data = await saltResponse.json();
      userSalt = data.salt;
    } else {
      let errorText = await saltResponse.text();
      let errorDetails = errorText;
      try {
        const errorData = JSON.parse(errorText);
        errorDetails = errorData.details ? JSON.parse(errorData.details).error : errorData.error;
      } catch (parseErr) {
        console.warn('Failed to parse error as JSON:', parseErr);
      }
      console.error('Salt request failed:', {
        status: saltResponse.status,
        details: errorDetails,
        rawResponse: errorText
      });
      throw new Error(`Failed to fetch user salt: ${errorDetails}`);
    }

    // Store salt in browser storage for device persistence
    sessionStorage.setItem(SESSION_KEYS.USER_SALT, userSalt);
    localStorage.setItem(`zklogin_salt_${decodedJwt.sub}`, userSalt);

    // Send salt backup email (only once per user)
    const saltBackupSent = sessionStorage.getItem(SESSION_KEYS.SALT_BACKUP_SENT);
    if (!saltBackupSent && decodedJwt.sub) {
      try {
        const userEmail = (decodedJwt as any).email || '';
        await sendSaltBackupEmail(userSalt, decodedJwt.sub, userEmail);
        sessionStorage.setItem(SESSION_KEYS.SALT_BACKUP_SENT, 'true');
        console.log('Salt backup email sent to user');
      } catch (emailError) {
        console.warn('Failed to send salt backup email:', emailError);
        // Don't fail the login flow if email fails
      }
    }

    // Derive zkLogin address
    const zkLoginUserAddress = jwtToAddress(encodedJWT, userSalt);

    // Get extended ephemeral public key
    const extendedEphemeralPublicKey = getExtendedEphemeralPublicKey(
      ephemeralKeyPair.getPublicKey()
    );

    console.log('=== Sending to zkproof endpoint ===');
    console.log('Extended Ephemeral Public Key type:', typeof extendedEphemeralPublicKey);

    const proofResponse = await fetch(`${API_URL}/zklogin/zkproof`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jwt: encodedJWT,
        extendedEphemeralPublicKey,
        maxEpoch: Number(maxEpoch),
        jwtRandomness: randomness,
        salt: userSalt
      })
    });

    if (!proofResponse.ok) {
      const errorText = await proofResponse.text();
      console.error('Proof response error:', errorText);
      throw new Error(`Failed to generate ZK proof: ${errorText}`);
    }

    const partialZkLoginSignature: PartialZkLoginSignature = await proofResponse.json();

    // Store everything needed for transactions
    sessionStorage.setItem(SESSION_KEYS.ZK_PROOF, JSON.stringify(partialZkLoginSignature));
    sessionStorage.setItem(SESSION_KEYS.USER_SALT, userSalt);
    sessionStorage.setItem(SESSION_KEYS.DECODED_JWT, JSON.stringify(decodedJwt));
    sessionStorage.setItem(SESSION_KEYS.ZKLOGIN_ADDRESS, zkLoginUserAddress);

    return {
      zkLoginUserAddress,
      decodedJwt
    };
  } catch (error) {
    console.error('Error completing zkLogin:', error);
    throw new Error(
      `Failed to complete zkLogin: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function executeZkLoginTransaction(
  transactionBlock: Transaction
): Promise<any> {
  try {
    // Retrieve session data
    const ephemeralPrivateKeyStr = sessionStorage.getItem(SESSION_KEYS.EPHEMERAL_PRIVATE_KEY);
    const maxEpoch = sessionStorage.getItem(SESSION_KEYS.MAX_EPOCH);
    const zkProofStr = sessionStorage.getItem(SESSION_KEYS.ZK_PROOF);
    const userSalt = sessionStorage.getItem(SESSION_KEYS.USER_SALT);
    const decodedJwtStr = sessionStorage.getItem(SESSION_KEYS.DECODED_JWT);
    const zkLoginAddress = sessionStorage.getItem(SESSION_KEYS.ZKLOGIN_ADDRESS);

    if (!ephemeralPrivateKeyStr || !zkProofStr || !userSalt || !decodedJwtStr || !maxEpoch) {
      throw new Error('Missing zkLogin session data. Please login again.');
    }

    const zkProof: PartialZkLoginSignature = JSON.parse(zkProofStr);
    const decodedJwt: JwtPayload = JSON.parse(decodedJwtStr);

    // Recreate ephemeral keypair using the bech32 secret key string
    const ephemeralKeyPair = Ed25519Keypair.fromSecretKey(ephemeralPrivateKeyStr);

    // Set transaction sender
    if (!zkLoginAddress) {
      throw new Error('zkLogin address not found');
    }
    transactionBlock.setSender(zkLoginAddress);

    // Sign transaction with ephemeral key
    const { bytes, signature: userSignature } = await transactionBlock.sign({
      client: suiClient,
      signer: ephemeralKeyPair
    });

    // Generate address seed
    const aud = Array.isArray(decodedJwt.aud) ? decodedJwt.aud[0] : decodedJwt.aud;
    if (!aud) {
      throw new Error('JWT "aud" claim is missing');
    }
    const addressSeed = genAddressSeed(
      BigInt(userSalt),
      'sub',
      decodedJwt.sub!,
      aud
    ).toString();

    // Assemble zkLogin signature
    const zkLoginSignature = getZkLoginSignature({
      inputs: {
        ...zkProof,
        addressSeed
      },
      maxEpoch,
      userSignature
    });

    // Execute transaction
    const result = await suiClient.executeTransactionBlock({
      transactionBlock: bytes,
      signature: zkLoginSignature
    });

    return result;
  } catch (error) {
    console.error('Error executing transaction:', error);
    throw new Error(
      `Failed to execute transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Utility: Check if user has an active zkLogin session
 */
export function isZkLoginSessionActive(): boolean {
  return sessionStorage.getItem(SESSION_KEYS.ZKLOGIN_ADDRESS) !== null;
}

/**
 * Utility: Get current zkLogin address
 */
export function getZkLoginAddress(): string | null {
  return sessionStorage.getItem(SESSION_KEYS.ZKLOGIN_ADDRESS);
}

/**
 * Utility: Logout and clear session
 */
export function zkLoginLogout(): void {
  Object.values(SESSION_KEYS).forEach(key => {
    sessionStorage.removeItem(key);
  });
}

/**
 * Utility: Get decoded JWT from session
 */
export function getDecodedJwt(): JwtPayload | null {
  const decodedJwtStr = sessionStorage.getItem(SESSION_KEYS.DECODED_JWT);
  if (!decodedJwtStr) return null;
  return JSON.parse(decodedJwtStr);
}

/**
 * Send salt backup email for wallet recovery
 */
async function sendSaltBackupEmail(
  userSalt: string,
  userSub: string,
  userEmail?: string
): Promise<void> {
  try {
    const response = await fetch(`${API_URL}/zklogin/email-salt-backup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userSub,
        userEmail,
        userSalt,
        timestamp: new Date().toISOString()
      })
    });

    if (!response.ok) {
      throw new Error(`Email service returned ${response.status}`);
    }

    const result = await response.json();
    console.log('Salt backup email sent:', result);
  } catch (error) {
    console.error('Error sending salt backup email:', error);
    throw error;
  }
}

/**
 * Recover salt from browser storage (for device/browser switching)
 */
export function recoverSaltFromStorage(userSub: string): string | null {
  return localStorage.getItem(`zklogin_salt_${userSub}`);
}

/**
 * Utility: Clear all salt backups
 */
export function clearSaltBackups(): void {
  // Clear all localStorage items with zklogin_salt_ prefix
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('zklogin_salt_')) {
      localStorage.removeItem(key);
    }
  }
}
