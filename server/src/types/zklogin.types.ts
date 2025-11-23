export interface EpochInfo {
  epoch: string
  epochDurationMs: string
  epochStartTimestampMs: string
}

export interface SaltRequest {
  token: string
}

export interface SaltResponse {
  salt: string
}

export interface ZkProofRequest {
  jwt: string
  extendedEphemeralPublicKey: string
  maxEpoch: string
  jwtRandomness: string
  salt: string
  keyClaimName?: string
}

export interface ZkProofResponse {
  proofPoints: {
    a: string[]
    b: string[][]
    c: string[]
  }
  issBase64Details: {
    value: string
    indexMod4: number
  }
  headerBase64: string
}