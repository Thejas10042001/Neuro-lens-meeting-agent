
import type { CognitiveDataPoint } from '../types';

// --- MATH UTILS: KALMAN FILTER FOR SIGNAL SMOOTHING ---
class KalmanFilter {
  private R = 1; // Process noise
  private Q = 1; // Measurement noise
  private A = 1; // State vector
  private B = 0; // Control vector
  private C = 1; // Measurement vector
  private cov = NaN;
  private x = NaN; // Estimated signal

  constructor(processNoise: number, measurementNoise: number) {
    this.R = processNoise;
    this.Q = measurementNoise;
  }

  filter(measurement: number) {
    if (isNaN(this.x)) {
      this.x = (1 / this.C) * measurement;
      this.cov = (1 / this.C) * this.Q * (1 / this.C);
    } else {
      const predX = (this.A * this.x) + (this.B * 0);
      const predCov = ((this.A * this.cov) * this.A) + this.R;

      const K = predCov * this.C * (1 / ((this.C * predCov * this.C) + this.Q));
      this.x = predX + K * (measurement - (this.C * predX));
      this.cov = predCov - (K * this.C * predCov);
    }
    return this.x;
  }
}

// Represents Precise Biometric Inputs derived from Face Landmarks
export interface BiometricInput {
    yaw: number; // Head rotation left/right (degrees)
    pitch: number; // Head tilt up/down (degrees)
    roll: number; // Head tilt side-to-side (degrees)
    ear: number; // Eye Aspect Ratio (0.0 closed - 0.3+ open)
    blinkRate: number; // Blinks per minute
    expressionConfidence: {
        neutral: number;
        happy: number;
        angry: number;
        fearful: number;
        surprised: number;
    };
    interactionLevel: number;
}

// Internal state of our cognitive model
interface CognitiveModelState {
    attention: number;
    stress: number;
    curiosity: number;
    lastUpdate: number;
}

export class CognitiveModel {
    private state: CognitiveModelState;
    
    // Filters to smooth out noisy webcam data for medical-grade curves
    private attentionFilter = new KalmanFilter(0.1, 10);
    private stressFilter = new KalmanFilter(0.1, 5);
    private curiosityFilter = new KalmanFilter(0.1, 8);

    constructor() {
        this.state = {
            attention: 50,
            stress: 30,
            curiosity: 60,
            lastUpdate: Date.now(),
        };
    }

    public update(input: BiometricInput): CognitiveDataPoint {
        this.state.lastUpdate = Date.now();

        // --- 1. PRECISE ATTENTION CALCULATION (GEOMETRIC) ---
        // A user looking directly at screen has Yaw ~ 0, Pitch ~ -5 to 5.
        // Penalty increases exponentially as angle increases.
        const yawPenalty = Math.pow(Math.abs(input.yaw), 1.6); // Punish side looking
        const pitchPenalty = Math.pow(Math.abs(input.pitch - 5), 1.6); // Assume slight down-tilt is normal
        
        // Base attention from head pose
        let rawAttention = 100 - (yawPenalty + pitchPenalty);
        
        // Eye Aspect Ratio check (Drowsiness/Distraction)
        // EAR < 0.20 usually means eyes closing/looking down
        if (input.ear < 0.20) {
            rawAttention -= 50; 
        }

        // Clamp
        rawAttention = Math.max(0, Math.min(100, rawAttention));
        const smoothedAttention = this.attentionFilter.filter(rawAttention);

        // --- 2. STRESS CALCULATION (PHYSIOLOGICAL) ---
        // Factors:
        // - Blink Rate: Normal is 10-20. >25 is stress/nervousness. <5 is high cognitive load or staring.
        // - Expression: Angry/Fearful micro-expressions.
        
        let stressBase = 30; // Baseline

        // Blink Rate Analysis
        if (input.blinkRate > 30) stressBase += 30; // Panic / High Anxiety
        else if (input.blinkRate > 20) stressBase += 15; // Mild Stress
        else if (input.blinkRate < 5) stressBase += 10; // Intense Stare (can be stress or focus)

        // Micro-expression injection (Weighted)
        stressBase += (input.expressionConfidence.angry * 60);
        stressBase += (input.expressionConfidence.fearful * 70);
        stressBase += (input.expressionConfidence.neutral * -10); // Neutral face reduces stress estimate
        
        // Mitigation by positive affect
        stressBase -= (input.expressionConfidence.happy * 30);

        const smoothedStress = this.stressFilter.filter(Math.max(0, Math.min(100, stressBase)));

        // --- 3. CURIOSITY & FLOW (DERIVED) ---
        // Flow State = High Attention + Moderate/Low Stress + Challenge Match
        // Curiosity = Forward Lean (Pitch) + Surprised/Happy Expressions + High Attention
        
        let curiosityBase = 50;
        
        // Flow triggers
        if (smoothedAttention > 80 && smoothedStress < 40) {
            curiosityBase += 20; // Flow state bonus
        }
        
        // Leaning in (Pitch is negative, e.g., -10 to -25)
        if (input.pitch < -5 && input.pitch > -25) {
            curiosityBase += 15;
        }
        
        // Expression triggers
        curiosityBase += (input.expressionConfidence.surprised * 50);
        curiosityBase += (input.expressionConfidence.happy * 20);
        
        const smoothedCuriosity = this.curiosityFilter.filter(Math.max(0, Math.min(100, curiosityBase)));

        // Update internal state
        this.state.attention = smoothedAttention;
        this.state.stress = smoothedStress;
        this.state.curiosity = smoothedCuriosity;

        return {
            time: Date.now(),
            attention: parseFloat(this.state.attention.toFixed(2)),
            stress: parseFloat(this.state.stress.toFixed(2)),
            curiosity: parseFloat(this.state.curiosity.toFixed(2)),
        };
    }
}
