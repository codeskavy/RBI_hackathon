export interface JwtPayload {
  iss?: string;
  sub?: string;
  aud?: string[] | string;
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  nonce?: string;
}

export interface EpochInfo {
  epoch: string;
  epochDurationMs:string;
  epochStartTimestampMs: string;
}

export interface ZkLoginSession {
  ephemeralPrivateKey: string;
  maxEpoch: string;
  randomness: string;
  userSalt: string;
  zkProof: PartialZkLoginSignature;
  decodedJwt: JwtPayload;
  zkLoginAddress: string;
}

export interface PartialZkLoginSignature {
  proofPoints: {
    a: string;
    b: string;
    c: string;
  };
  issBase64Details: {
    value: string;
    indexMod4: number;
  };
  headerBase64: string;
}

export interface ZkLoginState {
  isLoggedIn: boolean;
  address: string | null;
  loading: boolean;
  error: string | null;
}