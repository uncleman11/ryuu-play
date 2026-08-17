import {
  Player, State, PassTurnAction, Action, GamePhase, Prompt,
  InvitePlayerPrompt, StateLog, ResolvePromptAction, GameLog, BotAi
} from '@ptcg/common';
import { PromptResolver } from './prompt-resolver/prompt-resolver';
import { SimpleTactic } from './simple-tactics/simple-tactics';
import { SimpleBotOptions } from './simple-bot-options';
import { Simulator } from '@ptcg/common';
import * as tf from '@tensorflow/tfjs-node';

interface Experience {
  state: number[];
  action: number;
  reward: number;
  nextState: number[];
  done: boolean;
}

// --- Configuration / Hyperparameters ---
const GAMMA: number = 0.95;
const EPSILON_START: number = 1.0;
const EPSILON_DECAY: number = 0.995;
const EPSILON_MIN: number = 0.01;
const BATCH_SIZE: number = 32;
const MEMORY_SIZE: number = 2000;
const LEARNING_RATE: number = 0.001;

// --- 1. The Neural Network Factory ---
function createModel(): tf.LayersModel {
  const model = tf.sequential();
  model.add(tf.layers.dense({ units: 24, inputShape: [4], activation: 'relu' }));
  model.add(tf.layers.dense({ units: 24, activation: 'relu' }));
  model.add(tf.layers.dense({ units: 2, activation: 'linear' })); // 2 actions

  model.compile({
    optimizer: tf.train.adam(LEARNING_RATE),
    loss: 'meanSquaredError'
  });
  return model;
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

// --- 3. The DQN Agent ---
class DQNAgent {
  public model: tf.LayersModel;
  private targetModel: tf.LayersModel;
  public memory: ReplayBuffer;
  public epsilon: number;

  constructor() {
    this.model = createModel();
    this.targetModel = createModel();
    this.updateTargetModel();
    this.memory = new ReplayBuffer(MEMORY_SIZE);
    this.epsilon = EPSILON_START;
  }

  public updateTargetModel(): void {
    this.targetModel.setWeights(this.model.getWeights());
  }

  public act(state: number[]): number {
    // Exploration vs Exploitation
    if (Math.random() < this.epsilon) {
      return Math.floor(Math.random() * 2); // Random action
    }

    return tf.tidy(() => {
      const stateTensor = tf.tensor2d([state]);
      const prediction = this.model.predict(stateTensor);
      // Get index of the highest Q-value
      return prediction.argMax(1).dataSync()[0] as number;
    });
  }

  public async train(): Promise<void> {
    if (this.memory.length < BATCH_SIZE) return;

    const batch = this.memory.sample(BATCH_SIZE);

    // Prepare tensors for the batch
    const stateTensor = tf.tensor2d(batch.map(b => b.state));
    const nextStateTensor = tf.tensor2d(batch.map(b => b.nextState));

    // Use tf.tidy or manual disposal to manage memory
    const currentQs = this.model.predict(stateTensor);
    const nextQs = this.targetModel.predict(nextStateTensor);

    const currentQsData = currentQs.arraySync();
    const nextQsData = nextQs.arraySync();

    // Calculate Q targets
    const targets: number[][] = currentQsData.map((q, i) => {
      const actionIdx = batch[i].action;
      const maxNextQ = Math.max(...nextQsData[i]);
      const target = batch[i].reward + (batch[i].done ? 0 : GAMMA * maxNextQ);

      const newQArray = [...q]; // Clone array
      newQArray[actionIdx] = target;
      return newQArray;
    });

    const targetsTensor = tf.tensor2d(targets);

    // Train the model
    await this.model.fit(stateTensor, targetsTensor, {
      epochs: 1,
      verbose: 0
    });

    // Decay epsilon
    if (this.epsilon > EPSILON_MIN) {
      this.epsilon *= EPSILON_DECAY;
    }

    // Manual disposal of all intermediate tensors to prevent memory leaks
    tf.dispose([stateTensor, nextStateTensor, currentQs, nextQs, targetsTensor]);
  }
}

// --- 4. Execution Loop ---
// async function run() {
//   const agent = new DQNAgent();

//   console.log('Training started...');

//   for (let episode = 0; episode < 100; episode++) {
//     // Mock Environment State: [position, velocity, distanceToGoal, angle]
//     let state: number[] = [Math.random(), Math.random(), Math.random(), Math.random()];
//     let totalReward = 0;

//     for (let step = 0; step < 50; step++) {
//       const action = agent.act(state);

//       // Mock environment response
//       const nextState: number[] = [Math.random(), Math.random(), Math.random(), Math.random()];
//       const reward = Math.random() > 0.8 ? 1 : -0.1; // Reward logic
//       const done = step === 49;

//       agent.memory.add(state, action, reward, nextState, done);
//       await agent.train();

//       state = nextState;
//       totalReward += reward;
//     }

//     if (episode % 10 === 0) {
//       agent.updateTargetModel();
//       console.log(`Episode: ${episode} | Reward: ${totalReward.toFixed(2)} | Epsilon: ${agent.epsilon.toFixed(3)}`);
//     }
//   }
//   console.log('Training complete.');
// }

export class MachineLearningAi implements BotAi {

  private tactics: SimpleTactic[];
  private resolvers: PromptResolver[];
  private agent = new DQNAgent();

  constructor(
    private playerId: number,
    options: SimpleBotOptions,
    private deck: string[] | null
  ) {
    this.tactics = options.tactics.map(tactic => new tactic(options));
    this.resolvers = options.promptResolvers.map(resolver => new resolver(options));
  }

  public decodeNextAction(state: State): Action | undefined {
    let player: Player | undefined;
    // Get the player object whose action needs to be decoded
    for (let i = 0; i < state.players.length; i++) {
      if (state.players[i].id === this.playerId) {
        player = state.players[i];
      }
    }

    if (player === undefined) {
      return;
    }

    // Check if any pending prompt is present for the player that hasn't been resolved yet.
    if (state.prompts.length > 0) {
      const playerId = player.id;
      const prompt = state.prompts.find(p => p.playerId === playerId && p.result === undefined);
      if (prompt !== undefined) {
        // If there's such prompt, resolve it
        return this.resolvePrompt(player, state, prompt);
      }
    }

    // Wait for other players to resolve the prompts.
    if (state.prompts.filter(p => p.result === undefined).length > 0) {
      return;
    }

    const activePlayer = state.players[state.activePlayer];
    const isMyTurn = activePlayer.id === this.playerId;
    if (state.phase === GamePhase.PLAYER_TURN && isMyTurn) {
      return this.decodePlayerTurnAction(player, state);
    }
  }

  private decodePlayerTurnAction(player: Player, state: State): Action {
    for (let i = 0; i < this.tactics.length; i++) {
      const action = this.tactics[i].useTactic(state, player);
      if (action !== undefined && this.isValidAction(state, action)) {
        return action;
      }
    }

    return new PassTurnAction(this.playerId);
  }

  private resolvePrompt(player: Player, state: State, prompt: Prompt<any>): Action {
    if (prompt instanceof InvitePlayerPrompt) {
      const result = this.deck;
      let log: StateLog | undefined;
      if (result === null) {
        log = new StateLog(GameLog.LOG_TEXT, {
          text: 'Sorry, my deck is not ready.'
        }, player.id);
      }
      return new ResolvePromptAction(prompt.id, result, log);
    }

    for (let i = 0; i < this.resolvers.length; i++) {
      const action = this.resolvers[i].resolvePrompt(state, player, prompt);
      if (action !== undefined) {
        return action;
      }
    }

    // Unknown prompt type. Try to cancel it.
    return new ResolvePromptAction(prompt.id, null);
  }

  private isValidAction(state: State, action: Action): boolean {
    try {
      const simulator = new Simulator(state);
      simulator.dispatch(action);
    } catch (error) {
      return false;
    }
    return true;
  }

}
