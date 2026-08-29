import * as fs from 'fs';
import { Mutex } from 'async-mutex';

import { DQNAgent } from './dqn-agent';
import { Action } from '../store/actions/action';
import { Player } from '../store/state/player';

/**
 * A simplified Game State. 
 * In your real app, this would be the result of your preprocessGameState function.
 */

// --- 2. MCTS Components ---

const N_SAVE_EVERY_EPISODE = 50;

class MCTSNode {
  public children: Map<number, MCTSNode> = new Map();
  public visits: number = 0;
  public value: number = 0;
  public actionName: string = '';
  public parent: MCTSNode | null = null;
  // public updateNodeMutex = new Mutex();

  constructor(public state: number[], public parentNode?: MCTSNode) {
    this.parentNode = parentNode;
  }

  toJSON() {
    const obj: any = {
      visits: this.visits,
      value: this.value,
      actionName: this.actionName,
      children: {}
    };
    // Convert Map to Object for JSON compatibility
    this.children.forEach((child, action) => {
      obj.children[action] = child.toJSON();
    });
    return obj;
  }
}

export class MCTSTree {
  private roots: Map<number, MCTSNode> = new Map();
  private botCursors: Map<number, MCTSNode> = new Map();
  private agent: DQNAgent;
  private inputSize: number = 18;
  private static updateMutex = new Mutex();

  constructor() {
    this.agent = new DQNAgent();
  }
  /**
   * Called by the environment for each bot.
   * Returns the best action for a specific player_id.
  */
  public selectAction(clientId: number, initialState: number[], legalActionIndexes: number[] | undefined, legalActions: Action[]): number {
    // console.log('ACQUIRE LOCK AT SELECT ACTION TIME' + clientId);
    // const release = await MCTSTree.selectActionmutex.acquire();
    let bestAction: number = -1;
    // 1. Ensure this bot has its own root in the tree
    if (!this.roots.has(clientId)) {
      this.roots.set(clientId, new MCTSNode(initialState));
    }

    // 2. Set the bot's current cursor to its root
    this.botCursors.set(clientId, this.roots.get(clientId)!);
    const root = this.roots.get(clientId)!;

    const rankedActions = this.agent.getRankedActions(initialState);

    // Find the best legal action from the DQN's ranked list
    for (const rankedAction of rankedActions) {
      if (legalActionIndexes?.includes(rankedAction)) {
        bestAction = rankedAction;
        break;
      }
    }

    // 3. Expansion
    if (bestAction !== -1) {
      // Create a child node for this specific bot's action
      // We use a dummy state because the actual next state is provided by the environment
      const nextStateStub = new MCTSNode(new Array(this.inputSize).fill(0), root);
      nextStateStub.actionName = legalActions[bestAction].type;
      root.children.set(bestAction, nextStateStub);

      // The bot's next "cursor" will be this child
      this.botCursors.set(clientId, nextStateStub);
    }
    // release();
    return bestAction;
  }

  /**
   * Exposed as requested: Returns actions ranked by their tree/model value
  */
  public getRankedActions(state: number[]): number[] {
    return this.agent.getRankedActions(state);
  }

  public preprocessGameState(players: Player[]): number[] {
    return this.agent.preprocessGameState(players);
  }

  public async loadModel(checkpointPath: string): Promise<void> {
    await this.agent.loadModel(checkpointPath);
  }

  /**
   * Updates the MCTS and DQN for a specific player_id.
   */
  public async update(clientId: number, playerId: number | undefined, state: Player[] | undefined, action: number, nextState: Player[] | undefined): Promise<number> {
    let loss: number = -1;
    try {
      // 1. Find the specific root for this bot
      const root = this.roots.get(clientId);
      if (!root) {
        return -1;
      }
      // 2. Find the child node that corresponds to the action taken
      const actionNode = root.children.get(action);
      if (!actionNode) {
        console.error(`Action ${action} not found in tree for client ${clientId}`);
        return -1;
      }
      let statePlayer: Player = new Player();
      let nextStatePlayer: Player = new Player();
      let reward = 0;
      let done: boolean = false;
      for (let i = 0; i < state!.length; i++) {
        if (state![i].id === playerId) {
          statePlayer = state![i];
        }
      }
      for (let i = 0; i < nextState!.length; i++) {
        if (nextState![i].id === playerId) {
          nextStatePlayer = nextState![i];
        }
      }
      const statePrizes = statePlayer.prizes.length;
      const nextStatePrizes = nextStatePlayer.prizes.length;


      if (nextStatePlayer?.prizes.length == 0) {
        console.log('Won all prize cards, reward +10!');
        reward = 10;
        done = true;
      }
      else if (nextStatePrizes < statePrizes) {
        console.log('Won a prize card, reward +1!');
        reward = 1;
      }
      else
      {
        reward = -1;
      }

      // 3. Backpropagate Reward
      // We update the action node and all its ancestors
      let currentNode: MCTSNode | null = actionNode;
      while (currentNode !== null) {
        currentNode.visits++;
        currentNode.value += reward;
        currentNode = currentNode.parent;
      }

      // 4. Train the shared DQN model with this specific experience
      // This ensures that even though bots are independent, they are 
      // contributing to a shared "intelligence."
      const release = await MCTSTree.updateMutex.acquire();
      loss = await this.agent.trainingStep(state, action, nextState, reward, done);

      if (this.agent.episode % N_SAVE_EVERY_EPISODE === 0) {
        await this.saveToFile();
      }
      release();
    }
    catch(error) {
      console.log(error);
    }

    return loss;
  }

  public async saveToFile() {
    const treeData: any = {};
    this.roots.forEach((root, id) => {
      treeData[id] = root.toJSON();
    });
    const data = JSON.stringify(treeData, null, 2);
    const modelSavePath = `file://./models/checkpoint_epoch_${this.agent.episode}`;
    await this.agent.model.save(modelSavePath);
    const treeSavePath = `models/tree_data_${this.agent.episode}.json`;
    fs.writeFileSync(treeSavePath, data, 'utf8');
    console.log(`Tree saved to ${treeSavePath}`);
  }

}

// --- Usage Example ---
// async function run() {
//   const agent = new DQNAgent();
//   const mcts = new MCTSTree(agent);

//   // Game Loop
//   let currentState: GameState = { features: [Math.random(), Math.random(), Math.random(), Math.random()] };

//   for (let turn = 0; turn < 50; turn++) {
//     // MCTS decides the best move
//     const action = mcts.selectAction(currentState);
//     console.log(`Turn ${turn}: Agent chose action ${action}`);

//     // Environment logic
//     const nextState: GameState = { features: [Math.random(), Math.random(), Math.random(), Math.random()] };
//     const reward = 1.0;
//     const done = false;

//     // MCTS updates its tree and the DQN trains on this data
//     await mcts.update(currentState, action, reward, nextState, done);

//     currentState = nextState;
//   }
// }

// run();
