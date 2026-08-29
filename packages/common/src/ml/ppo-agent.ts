import * as fs from 'fs';
import * as tf from '@tensorflow/tfjs-node';

import { EnergyCard } from '../store/card/energy-card';
import { Player } from '../store/state/player';
import { GameData } from './gamedata';

interface Experience {
  state: number[];
  action: number;
  reward: number;
  nextState: number[];
  done: boolean;
  mask: number[];
}

// --- 3. The DQN Agent ---
// --- Configuration / Hyperparameters ---
const GAMMA: number = 0.95;
const EPSILON_START: number = 1.0;
const EPSILON_DECAY: number = 0.995;
const EPSILON_MIN: number = 0.01;
const BATCH_SIZE: number = 32;
const MEMORY_SIZE: number = 2000;
const LEARNING_RATE: number = 0.001;
const STATE_SIZE: number = 30; //TODO: CHECK CORRECT INPUT SIZE
const ACTION_SIZE: number = 131;


export class DQNAgent {
  public model: tf.LayersModel;
  public memory: ReplayBuffer;
  public epsilon: number;
  public episode: number;

  private logPath: string;
  private optimizer: tf.AdamOptimizer


  constructor() {
    this.memory = new ReplayBuffer(MEMORY_SIZE);
    this.epsilon = EPSILON_START;
    this.episode = 0;
    this.logPath = 'logs/loss.csv';
    this.optimizer = tf.train.adam(LEARNING_RATE);

    // Create the CSV file and write the header if it doesn't exist
    if (!fs.existsSync(this.logPath)) {
      const header = 'episode,loss,reward,epsilon\n';
      fs.writeFileSync(this.logPath, header);
    }

    // The Actor-Critic Model
    const input = tf.input({ shape: [STATE_SIZE] });
        
    const shared = tf.layers.dense({ units: 128, activation: 'relu' }).apply(input) as tf.SymbolicTensor;
    const shared2 = tf.layers.dense({ units: 128, activation: 'relu' }).apply(shared) as tf.SymbolicTensor;

    const logits = tf.layers.dense({ units: ACTION_SIZE, name: 'actor' }).apply(shared2) as tf.SymbolicTensor;
    const value = tf.layers.dense({ units: 1, name: 'critic' }).apply(shared2) as tf.SymbolicTensor;

    this.model = tf.model({ inputs: input, outputs: [logits, value] });
    
    this.optimizer = tf.train.adam(LEARNING_RATE);
  }

  public async loadModel(checkpointPath: string): Promise<void> {
    if (fs.existsSync(checkpointPath)) {
      // Load from existing checkpoint if provided
      console.log(`Loading checkpoint from ${checkpointPath}...`);
      this.model = await tf.loadLayersModel(checkpointPath);
    } 
    throw new Error('Model file not found in ' + checkpointPath +'.');
  }

  public preprocessGameState(players: Player[]): number[] {
    const state: number[] = [];

    // We process each player to extract "Features"
    players.forEach((player, index) => {
      // 1. Hand size (Normalized: 0 to 1. Max hand is usually 7 or 10)
      state.push(player.hand.cards.length / 10);

      // 2. Discard pile size (Normalized: 0 to 1. Max discard 60)
      state.push(player.discard.cards.length / 60);

      // 3. Prizes taken (Normalized: 0 to 1. Max prizes 6)
      state.push(player.prizes.length / 6);

      // 4. Active Pokemon HP (Normalized by a constant like 300)
      // We use the first pokemon in the slot or 0 if empty
      const activeHP = player.active.pokemons.cards[0]?.hp || 0;
      state.push(activeHP / 300);

      // 5. Active Pokemon Damage Taken (Normalized by 300)
      state.push(Math.min(player.active.damage / 300, 1));

      // 6. Energy in Hand (Count)
      const handEnergy = player.hand.cards.filter(c => c instanceof EnergyCard).length;
      state.push(handEnergy / 10);

      // 7. Number of Pokemon on Bench
      state.push(player.bench.length / 6);

      // 8. Total Energy on Bench
      let benchEnergy = 0;
      player.bench.forEach(slot => {
        benchEnergy += slot.energies.cards.filter(c => c instanceof EnergyCard).length;
      });
      state.push(benchEnergy / 10);

      // 9. Supporters in hand (count)
      const supporterCount = player.hand.cards.filter(c => c.name.includes('Supporter')).length; // Example logic
      state.push(supporterCount / 10);
    });

    // Add a dummy value for "Turn Number" or "Game Phase" if you want to help the AI
    // This keeps the array size consistent.
    return state;
  }

  public act(state: number[], mask: number[]): [any, any] {
    return tf.tidy(() => {
      const stateTensor = tf.tensor2d([state]);
      const maskTensor = tf.tensor2d(mask);
      const output: any = this.model.predict(stateTensor);
      const logits = output[0];
      const value = output[1];

      // ACTION MASKING LOGIC:
      // We add a very large negative number to the logits of illegal actions.
      // This ensures that after Softmax, their probability is effectively 0.
      const maskedLogits = logits.add(maskTensor.mul(tf.scalar(-1e9)));
      
      const probabilities = tf.softmax(maskedLogits);
      return [probabilities, value];
  });
  }

  public getRankedActions(state: number[]): number[] {
    return tf.tidy(() => {
      const stateTensor = tf.tensor2d([state]);
      // We cast to Tensor because predict() can return Tensor | Tensor[]
      const prediction = this.model.predict(stateTensor) as tf.Tensor;

      // dataSync() returns a flat array of all values (e.g., [Q_action0, Q_action1])
      const qValues = prediction.dataSync();

      // 1. Create an array of objects: [{ index: 0, value: 0.5 }, { index: 1, value: 0.8 }]
      const indexedValues = Array.from(qValues).map((val, idx) => ({
        index: idx,
        value: val as number
      }));

      // 2. Sort by value in descending order (highest Q-Value first)
      indexedValues.sort((a, b) => b.value - a.value);

      // 3. Return only the indices
      return indexedValues.map(item => item.index);
    });
  }
  
  public async trainingStep() {
    const experiences = this.memory.sample(BATCH_SIZE);
    const states = tf.tensor2d(experiences.map(point => point.state));
    const rewards = tf.tensor1d(experiences.map(point => point.reward));
    const oldActions = experiences.map(point => point.action); // Indices of actions taken
    const masks = tf.tensor2d(experiences.map(point => point.mask));
    const oldProbs = tf.tensor1d(experiences.map(point => point.oldProb));
    this.optimizer.minimize(() => {
      const output: any = this.model.predict(states);
      const logits = output[0];
      const values = output[1];
      
      // Apply Masking
      const maskedLogits = logits.add(masks.mul(tf.scalar(-1e9)));
      const probs = tf.softmax(maskedLogits);
      
      // Calculate Advantages (Simplified GAE)
      // Advantage = Actual Reward - Critic Value
      const advantages = rewards.sub(values).flatten();

      // Get probability of the action actually taken
      const actionMasks = tf.oneHot(oldActions, ACTION_SIZE);
      const probOfAction = tf.sum(probs.mul(actionMasks), 1);
      
      // Ratio r(t) = pi_theta / pi_old
      const ratio = probOfAction.div(oldProbs);

      // PPO Clipped Objective
      const surr1 = ratio.mul(advantages);
      const surr2 = tf.minimum(
          ratio.clipByValue(1 - this.epsilon, 1 + this.epsilon),
          advantages
      );

      const loss = tf.mean(tf.minimum(surr1, surr2)).neg(); // Negative because we minimize loss
      return loss as tf.Scalar
  });
}


// --- 2. Experience Replay Buffer ---
class ReplayBuffer {
  private buffer: Experience[] = [];
  constructor(private maxSize: number) { }

  add(state: number[], action: number, reward: number, nextState: number[], done: boolean, mask: number[]): void {
    if (this.buffer.length >= this.maxSize) {
      this.buffer.shift();
    }
    this.buffer.push({ state, action, reward, nextState, done, mask });
  }
  addGameData(gameData: GameData) {
    const states: number[][] = gameData.getStates();
    const actions: number[] = gameData.getActions();
    const reward: number[] = gameData.getRewards();
    const nextStates: number[][] = gameData.getNextStates();
    const dones: boolean[] = gameData.getDones();
    const masks: number[][] = gameData.getMasks();

    for(let i = 0; i < gameData.getStates().length; i++) {
      this.add(states[i], actions[i], reward[i], nextStates[i], dones[i], masks[i]);
    }
  }
  sample(batchSize: number): Experience[] {
    const samples: Experience[] = [];
    for (let i = 0; i < batchSize; i++) {
      const index = Math.floor(Math.random() * this.buffer.length);
      samples.push(this.buffer[index]);
    }
    return samples;
  }

  getLength(): number {
    return this.buffer.length;
  }
}