import * as fs from 'fs';
import { Mutex } from 'async-mutex';

import { DQNAgent } from './dqn-agent';
import { GameDataPoint, GameData} from './gamedata'
import { Action } from '../store/actions/action';
import { Player } from '../store/state/player';

/**
 * A simplified Game State. 
 * In your real app, this would be the result of your preprocessGameState function.
 */

// --- 2. MCTS Components ---

const N_SAVE_EVERY_EPISODE = 50;
const MIN_TRAIN_SAMPLES = 2048;
const N_ACTIONS = 131;

export class PPO {
  private agent: DQNAgent;
  private static updateMutex = new Mutex();
  
  // Map containing rewards of a game played by a specific player
  // Key: [GameId, PlayerId]
  // Value: GameData
  private gamePlayerData : Map<Array<number>, GameData>;

  constructor() {
    this.agent = new DQNAgent();
    this.gamePlayerData = new Map<Array<number>, GameData>();
  }
  /**
   * Called by the environment for each bot.
   * Returns the best action for a specific player_id.
  */
  public selectAction(initialState: number[], mask: number[]): number {
    return this.agent.act(initialState, mask);
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

  private getPlayerState(state: Player[], playerId: number): Player {
    let statePlayer: Player | undefined = undefined;
    for (let i = 0; i < state!.length; i++) {
      if (state![i].id === playerId) {
        statePlayer = state![i];
      }
    }
    if (statePlayer == undefined) {
      throw new Error('Undefined Error in getPlayerState');
    }
    return statePlayer;
  }

  private computeReward(state: Player, nextState: Player) : number {
    const statePrizes: number = state.prizes.length;
    const nextStatePrizes: number = nextState.prizes.length;
    if (nextState.prizes.length == 0) {
      console.log('Won all prize cards, reward +10!');
      return 10;
    }
    else if (nextStatePrizes < statePrizes) {
      console.log('Won a prize card, reward +1!');
      return 1;
    }
    return  -1;
  }

  private isDone(state: Player, nextState: Player): boolean {
    if (nextState.prizes.length == 0) {
      return true;
    }
    return false;
  }

  private addGameDataPoint(gameId: number, playerId: number, gameDataPoint: GameDataPoint): void {
    if(!this.gamePlayerData.has([gameId, playerId])) {
      this.gamePlayerData.set([gameId, playerId], new GameData());
    }
    this.gamePlayerData.get([gameId, playerId])?.add(gameDataPoint);
  }

  /**
   * Updates the MCTS and DQN for a specific player_id.
   */
  public async update(gameId: number, clientId: number, playerId: number, state: Player[], action: number, nextState: Player[], mask: number[]): Promise<number> {
    let loss: number = -1;
    try {
      const playerState: Player = this.getPlayerState(state, playerId);
      const nextPlayerState: Player = this.getPlayerState(nextState, playerId);
      const reward: number = this.computeReward(playerState, nextPlayerState);
      const done: boolean = this.isDone(playerState, nextPlayerState);
      this.addGameDataPoint(
        gameId,
        playerId,
        new GameDataPoint(
          this.agent.preprocessGameState(state),
          action,
          reward,
          this.agent.preprocessGameState(nextState),
          done,
          mask
        )
      );

      // Add game to agent memory
      this.agent.memory.addGameData(this.gamePlayerData.get([gameId, playerId]));

      
      
      // Train if enough data
      if(this.agent.memory.getLength() >= 1024) {
        this.agent.trainingStep();
      }

      // Clear game data from map
      this.gamePlayerData.delete([gameId, playerId]);
      


      

      // 4. Train the shared DQN model with this specific experience
      // This ensures that even though bots are independent, they are 
      // contributing to a shared "intelligence."
      const release = await PPO.updateMutex.acquire();
      loss = await this.agent.trainingStep(state, action, nextState, reward, done);
      release();
    }
    catch(error) {
      console.log(error);
    }

    return loss;
  }

  // public async saveToFile() {
  //   const treeData: any = {};
  //   this.roots.forEach((root, id) => {
  //     treeData[id] = root.toJSON();
  //   });
  //   const data = JSON.stringify(treeData, null, 2);
  //   const modelSavePath = `file://./models/checkpoint_epoch_${this.agent.episode}`;
  //   await this.agent.model.save(modelSavePath);
  //   const treeSavePath = `models/tree_data_${this.agent.episode}.json`;
  //   fs.writeFileSync(treeSavePath, data, 'utf8');
  //   console.log(`Tree saved to ${treeSavePath}`);
  // }

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
