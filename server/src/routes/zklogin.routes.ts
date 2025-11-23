import { Router, Request, Response } from 'express';
import { suiClient, config } from '../config/sui.config';
import { 
  EpochInfo, 
  SaltRequest, 
  SaltResponse, 
  ZkProofRequest, 
  ZkProofResponse 
} from '../types/zklogin.types';
import jwt from 'jsonwebtoken';  // Ensure installed: npm i jsonwebtoken @types/jsonwebtoken
import crypto from 'crypto';  // Node.js built-in for salt derivation

const router = Router();

// Whitelist your OAuth client IDs (add more as needed; use env for prod)
const WHITELISTED_CLIENT_IDS: string[] = [
  config.CLIENT_ID, 
];

// Simple in-memory store for salts (use Redis/DB in prod for persistence across restarts)
const userSalts: Map<string, string> = new Map();

// Get current epoch info
router.get('/epoch', async (_req: Request, res: Response) => {
  try {
    const systemState = await suiClient.getLatestSuiSystemState();
    
    const epochInfo: EpochInfo = {
      epoch: systemState.epoch,
      epochDurationMs: systemState.epochDurationMs,
      epochStartTimestampMs: systemState.epochStartTimestampMs
    };
    
    res.json(epochInfo);
  } catch (error) {
    console.error('Error fetching epoch:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Get user salt (now local with whitelisting and derivation)
router.post('/salt', async (req: Request<{}, {}, SaltRequest>, res: Response) => {
  try {
    const { token } = req.body;
    
    console.log('=== Salt Request Debug ===');
    console.log('Raw token (first 100 chars):', token ? token.substring(0, 100) + '...' : 'EMPTY');
    console.log('Token length:', token ? token.length : 0);
    console.log('Token format check (parts):', token ? token.split('.').length : 0);

    if (!token || typeof token !== 'string' || token.split('.').length !== 3) {
      console.warn('Invalid token format received');
      return res.status(403).json({
        error: 'Salt service error',
        details: JSON.stringify({ error: 'Invalid JWT format' })
      });
    }

    // Decode JWT for claims (using jsonwebtoken for Node.js robustness; no signature verification for dev)
    let decoded: any;
    try {
      decoded = jwt.decode(token);  // Returns payload object or null if invalid
      if (!decoded) {
        throw new Error('Decoded payload is null');
      }
      console.log('JWT Claims:', {
        aud: decoded.aud,
        iss: decoded.iss,
        sub: decoded.sub,
        nonce: decoded.nonce,
        exp: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : 'Missing'
      });
    } catch (e) {
      console.error('JWT decode failed:');
      return res.status(403).json({
        error: 'Salt service error',
        details: JSON.stringify({ error: 'Invalid JWT' })
      });
    }

    if (!decoded || !decoded.sub) {
      return res.status(403).json({
        error: 'Salt service error',
        details: JSON.stringify({ error: 'Missing user subject (sub)' })
      });
    }

    // Extract and normalize aud (handle array edge case)
    const aud = decoded.aud;
    const normalizedAud = Array.isArray(aud) ? aud[0] : aud;
    console.log('Normalized aud:', normalizedAud);

    if (!normalizedAud || !WHITELISTED_CLIENT_IDS.includes(normalizedAud)) {
      console.warn('Client ID mismatch:', { 
        received: normalizedAud, 
        expected: WHITELISTED_CLIENT_IDS 
      });
      return res.status(403).json({
        error: 'Salt service error',
        details: JSON.stringify({ error: 'Invalid Client ID' })
      });
    }

    const userSub = decoded.sub;

    // Check in-memory cache first
    if (userSalts.has(userSub)) {
      console.log('Returning cached salt for user:', userSub);
      return res.json({ salt: userSalts.get(userSub)! });
    }

    // Derive consistent salt: Use HMAC-SHA256 of a master secret + sub, then take first 16 bytes as BigInt (fits < 2^128)
    const masterSecret = process.env.SALT_MASTER_SECRET || 'your-dev-master-secret-change-in-prod';  // Set in .env!
    const hmac = crypto.createHmac('sha256', masterSecret);
    hmac.update(userSub);
    const hash = hmac.digest();
    // Convert first 16 bytes to BigInt string (ensures consistency and randomness)
    const saltBytes = hash.slice(0, 16);
    const saltBigInt = BigInt('0x' + Buffer.from(saltBytes).toString('hex'));
    const salt = saltBigInt.toString();  // As string for JSON

    // Cache it
    userSalts.set(userSub, salt);
    console.log('Generated and cached new salt for user:', userSub, salt);

    res.json({ salt });
  } catch (error) {
    console.error('Salt endpoint error:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

// Get ZK proof
// In zklogin.routes.ts - Update the /zkproof endpoint:

router.post('/zkproof', async (req: Request<{}, {}, ZkProofRequest>, res: Response) => {
  try {
    const {
      jwt,
      extendedEphemeralPublicKey,
      maxEpoch,
      jwtRandomness,
      salt
    } = req.body;

    // Validate required fields
    if (!jwt || !extendedEphemeralPublicKey || !maxEpoch || !jwtRandomness || !salt) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log('=== ZK Proof Request to Prover ===');
    console.log('JWT (first 100 chars):', jwt.substring(0, 100) + '...');
    console.log('Extended Ephemeral Public Key:', extendedEphemeralPublicKey);
    console.log('Max Epoch:', maxEpoch);
    console.log('JWT Randomness:', jwtRandomness);
    console.log('Salt:', salt);

    // Prepare payload for Mysten prover - keyClaimName IS REQUIRED
    const payload = {
      jwt,
      extendedEphemeralPublicKey,
      maxEpoch,
      jwtRandomness,
      salt,
      keyClaimName: 'sub' // ← ADD THIS BACK - it's required by the prover!
    };

    const response = await fetch(config.proverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Prover error response:', errorText);
      throw new Error(`Prover service error: ${response.statusText} - ${errorText}`);
    }

    const zkProof: ZkProofResponse = await response.json() as ZkProofResponse;
    console.log('ZK Proof generated successfully');
    res.json(zkProof);
  } catch (error) {
    console.error('Error generating ZK proof:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
});

// Email salt backup for wallet recovery
router.post('/email-salt-backup', async (req: Request, res: Response) => {
  try {
    const { userSub, userEmail, userSalt, timestamp } = req.body;

    if (!userSub || !userSalt) {
      return res.status(400).json({ error: 'Missing userSub or userSalt' });
    }

    console.log('=== Salt Backup Email Request ===');
    console.log('User:', userSub);
    console.log('Email:', userEmail || 'Not provided');
    console.log('Timestamp:', timestamp);

    
    const emailContent = {
      subject: 'zkLogin Wallet Recovery Code',
      body: `
Dear User,

Your zkLogin wallet recovery code has been generated. 
**KEEP THIS SAFE** - You'll need it to access your wallet on a new device.

Recovery Code: ${userSalt}

This code was generated on: ${timestamp}
User ID: ${userSub}

If you didn't request this, please ignore this email.

Do not share this code with anyone.
      `
    };

    console.log('Email would be sent with:', {
      to: userEmail || 'Email not provided',
      subject: emailContent.subject,
      saltLength: userSalt.length
    });

    // Simulate email sending (replace with real email service)
    // Example: await sendEmail(userEmail, emailContent);

    res.json({
      success: true,
      message: 'Salt backup email would be sent',
      userSub,
      timestamp
    });
  } catch (error) {
    console.error('Error sending salt backup email:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to send salt backup email'
    });
  }
});

export default router;