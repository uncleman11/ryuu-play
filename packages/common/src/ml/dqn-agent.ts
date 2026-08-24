import * as fs from 'fs';
import * as tf from '@tensorflow/tfjs-node';
import { Mutex } from 'async-mutex';

import { EnergyCard } from '../store/card/energy-card';
import { Player } from '../store/state/player';

interface Experience {
  state: number[];
  action: number;
  reward: number;
  nextState: number[];
  done: boolean;
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


export class DQNAgent {
  public model: tf.LayersModel;
  private targetModel: tf.LayersModel;
  public memory: ReplayBuffer;
  public epsilon: number;
  public episode: number;

  private logPath: string;
  private static mutex = new Mutex();


  constructor() {
    this.model = this.createModel();
    this.targetModel = this.createModel();
    this.updateTargetModel();
    this.memory = new ReplayBuffer(MEMORY_SIZE);
    this.epsilon = EPSILON_START;
    this.episode = 0;
    this.logPath = 'logs/loss.csv';

    // Create the CSV file and write the header if it doesn't exist
    if (!fs.existsSync(this.logPath)) {
      const header = 'episode,loss,reward,epsilon\n';
      fs.writeFileSync(this.logPath, header);
    }
  }

  public async loadModel(checkpointPath: string): Promise<void> {
    if (fs.existsSync(checkpointPath)) {
      // Load from existing checkpoint if provided
      console.log(`Loading checkpoint from ${checkpointPath}...`);
      this.model = await tf.loadLayersModel(checkpointPath);
      this.targetModel = await tf.loadLayersModel(checkpointPath);
    } 
    throw new Error('Model file not found in ' + checkpointPath +'.');
  }

  // --- 1. The Neural Network Factory ---
  private createModel(): tf.LayersModel {
    const model = tf.sequential();
    model.add(tf.layers.dense({ units: 24, inputShape: [18], activation: 'relu' }));
    model.add(tf.layers.dense({ units: 24, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 131, activation: 'linear' })); // 131 actions

    model.compile({
      optimizer: tf.train.adam(LEARNING_RATE),
      loss: 'meanSquaredError'
    });
    return model;
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

  public updateTargetModel(): void {
    console.log('I AM UPDATING TARGET MODEL');
    this.targetModel.setWeights(this.model.getWeights());
  }

  public act(state: number[]): number {
    // Exploration vs Exploitation
    if (Math.random() < this.epsilon) {
      return Math.floor(Math.random() * 131); // Random action
    }

    return tf.tidy(() => {
      const stateTensor = tf.tensor2d([state]);
      const rawPrediction = this.model.predict(stateTensor);
      const prediction = Array.isArray(rawPrediction) ? rawPrediction[0] : rawPrediction;
      return prediction.argMax(1).dataSync()[0] as number;
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

  public async train(): Promise<number> {
    // if (this.memory.length < BATCH_SIZE) return;

    const batch = this.memory.sample(BATCH_SIZE);

    // Prepare tensors for the batch
    const stateTensor = tf.tensor2d(batch.map(b => b.state));
    const nextStateTensor = tf.tensor2d(batch.map(b => b.nextState));

    // Use tf.tidy or manual disposal to manage memory
    const currentQs = this.model.predict(stateTensor);
    const nextQs = this.targetModel.predict(nextStateTensor);


    let currentQsData: any;
    if (Array.isArray(currentQs)) {
      currentQsData = currentQs[0].arraySync();
    } else {
      currentQsData = currentQs.arraySync();
    }

    let nextQsData: any;
    if (Array.isArray(nextQs)) {
      nextQsData = nextQs[0].arraySync();
    } else {
      nextQsData = nextQs.arraySync();
    }

    // Calculate Q targets
    const targets: number[][] = currentQsData.map((q: any, i: any) => {
      const actionIdx = batch[i].action;
      const maxNextQ = Math.max(...nextQsData[i]);
      const target = batch[i].reward + (batch[i].done ? 0 : GAMMA * maxNextQ);

      const newQArray = [...q]; // Clone array
      newQArray[actionIdx] = target;
      return newQArray;
    });

    const targetsTensor = tf.tensor2d(targets);

    // Train the model
    const history = await this.model.fit(stateTensor, targetsTensor, {
      epochs: 1,
      verbose: 1
    });

    // Decay epsilon
    if (this.epsilon > EPSILON_MIN) {
      this.epsilon *= EPSILON_DECAY;
    }

    // --- THE CHANGE IS HERE ---
    // Capture the result of model.fit()
    

    // Extract the loss value from the first epoch [0]
    const loss = history.history.loss[0];
    const line = `${this.episode},${loss}}\n`;
    fs.appendFileSync(this.logPath, line);
    return loss as number;
  
    // Manual disposal of all intermediate tensors to prevent memory leaks
    // tf.dispose([stateTensor, nextStateTensor, currentQs, nextQs, targetsTensor]);
  }

  public async trainingStep(state: Player[] | undefined, action: number, nextState: Player[] | undefined, reward: number, done: boolean): Promise<number> {
    const release = await DQNAgent.mutex.acquire(); // Acquire lock
    this.memory.add(this.preprocessGameState(state!), action, reward, this.preprocessGameState(nextState!), done);
    const loss: number = await this.train();

    this.episode += 1;
    if (this.episode % 10 === 0) {
      this.updateTargetModel();
    }
    if (this.episode % 500 === 0)
    {
      const savePath = `file://./models/checkpoint_epoch_${this.episode}`;
      await this.model.save(savePath);
    }

    release(); // Release lock
    console.log('Training step ran fine. Episode: ' + this.episode);
    return loss;
  }
}


// --- 2. Experience Replay Buffer ---
class ReplayBuffer {
  private buffer: Experience[] = [];
  constructor(private maxSize: number) { }

  add(state: number[], action: number, reward: number, nextState: number[], done: boolean): void {
    if (this.buffer.length >= this.maxSize) {
      this.buffer.shift();
    }
    this.buffer.push({ state, action, reward, nextState, done });
  }

  sample(batchSize: number): Experience[] {
    const samples: Experience[] = [];
    for (let i = 0; i < batchSize; i++) {
      const index = Math.floor(Math.random() * this.buffer.length);
      samples.push(this.buffer[index]);
    }
    return samples;
  }

  get length(): number {
    return this.buffer.length;
  }
}