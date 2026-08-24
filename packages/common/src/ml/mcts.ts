import { DQNAgent } from './dqn-agent';
import { Player } from '../store/state/player';

/**
 * A simplified Game State. 
 * In your real app, this would be the result of your preprocessGameState function.
 */

// --- 2. MCTS Components ---

class MCTSNode {
  public children: Map<number, MCTSNode> = new Map();
  public visits: number = 0;
  public value: number = 0;
  public parent: MCTSNode | null = null;

  constructor(public state: number[], public parentNode?: MCTSNode) {
    this.parentNode = parentNode;
  }
}

export class MCTSTree {
  private root: MCTSNode;
  private agent: DQNAgent;
  private inputSize: number = 18;

  constructor(agent: DQNAgent) {
    this.agent = agent;
    // Initialize root with a dummy state (will be updated by search)
    this.root = new MCTSNode(Array(this.inputSize).fill(0));
  }

  /**
   * The main entry point for the environment.
   * Returns the best action based on tree search.
   */
  public selectAction(initialState: number[]): number {
    // Update root with current state
    this.root = new MCTSNode(initialState);

    // 1. Get ranked actions from DQN
    const rankedActions = this.agent.getRankedActions(initialState);

    // 2. Since we cannot simulate multiple paths and must use the best action:
    // We pick the first action in the ranked list (the highest Q-value).
    const bestAction = rankedActions[0];

    // 3. Expand the tree with this best action
    // In a real MCTS, expansion would create many children. 
    // Here, we create one child representing our chosen path.
    // We use a dummy state for the next step as it's provided by the environment return.
    const nextStateStub = new MCTSNode(new Array(18).fill(0), this.root);
    this.root.children.set(bestAction, nextStateStub);

    return bestAction;
  }

  /**
   * Exposed as requested: Returns actions ranked by their tree/model value
  */
  public getRankedActions(state: number[]): number[] {
    return this.agent.getRankedActions(state);
  }

  /**
   * Updates the MCTS and DQN with new data from the environment
   */
  public async update(state: Player[] | undefined, action: number, nextState: Player[] | undefined, player_id: number): Promise<number> {
    // 1. Backpropagate Reward: Update the root node's value based on the result
    this.root.visits++;

    let statePlayer: Player = new Player();
    let nextStatePlayer: Player = new Player();
    let reward = 0;
    let done: boolean = false;
    for (let i = 0; i < state!.length; i++) {
      if (state![i].id === player_id) {
        statePlayer = state![i];
      }
    }
    for (let i = 0; i < nextState!.length; i++) {
      if (nextState![i].id === player_id) {
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
    this.root.value += reward;
    

    // 2. Update the internal tree structure
    // (Logic to link the state -> action -> nextState nodes would go here)
    
    // 3. Train the underlying DQN model with this specific experience
    const loss = await this.agent.trainingStep(state, action, nextState, reward, done);

    return loss;
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
