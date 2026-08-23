import {
  Player, State, PassTurnAction, Action, GamePhase, Prompt,
  InvitePlayerPrompt, StateLog, ResolvePromptAction, GameLog, BotAi,
  Simulator, PlayCardAction, AttackAction, RetreatAction, UseAbilityAction,
  UseStadiumAction, UseTrainerInPlayAction, DQNAgent
} from '@ptcg/common';
import { PromptResolver } from './prompt-resolver/prompt-resolver';
import { PossibleActions } from './possible-actions/possible-actions';
import { SimpleBotOptions } from './simple-bot-options';


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

  private possibleActions: PossibleActions[];
  private legalActions: Action[];
  private resolvers: PromptResolver[];
  public possibleActionOffsets: Map<string, number>;
  public action_index: number = -1;

  constructor(
    private playerId: number,
    options: SimpleBotOptions,
    private deck: string[] | null
  ) {
    this.possibleActions = options.tactics.map(tactic => new tactic(options));
    this.resolvers = options.promptResolvers.map(resolver => new resolver(options));
    this.legalActions = Array(131).fill(null);
    this.possibleActionOffsets = new Map([
      ['PlayCardAction', 0],
      ['AttackAction', 90],
      ['RetreatAction', 95],
      ['UseAbilityAction', 119],
      ['UseStadiumAction', 120],
      ['UseTrainerInPlayAction', 126]
    ]);
  }

  public getPlayerId(): number {
    return this.playerId;
  }

  public registerLegalActions(possibleActions: Action[]): void {
    for (let i = 0; i < possibleActions.length; i++) {
      const possibleAction: Action = possibleActions[i];
      let offset: number = -1;
      switch (possibleAction.type) {
        case 'PLAY_CARD_ACTION': {
          const action = possibleAction as PlayCardAction;
          offset = this.possibleActionOffsets.get(possibleAction.type) ?? -1;
          this.legalActions[offset + action.target.index * 6 + action.handIndex] = action;
          break;
        }
        case 'ATTACK_ACTION':
        {
          const action = possibleAction as AttackAction;
          offset = this.possibleActionOffsets.get(possibleAction.type) ?? -1;
          this.legalActions[offset + action.localIndex] = action;
          break;
        }
        case 'RETREAT_ACTION':
        {
          const action = possibleAction as RetreatAction;
          offset = this.possibleActionOffsets.get(possibleAction.type) ?? -1;
          this.legalActions[offset + action.benchIndex] = action;
          break;
        }
        case 'USE_ABILITY_ACTION':
        {
          const action = possibleAction as UseAbilityAction;
          offset = this.possibleActionOffsets.get(possibleAction.type) ?? -1;
          this.legalActions[offset + action.target.index] = action;
          break;
        }
        case 'USE_STADIUM_ACTION':
        {
          const action = possibleAction as UseStadiumAction;
          offset = this.possibleActionOffsets.get(possibleAction.type) ?? -1;
          this.legalActions[offset] = action;
          break;
        }
        case 'USE_TRAINER_IN_PLAY_ACTION':
        {
          const action = possibleAction as UseTrainerInPlayAction;
          offset = this.possibleActionOffsets.get(possibleAction.type) ?? -1;
          this.legalActions[offset * action.target.index] = action;
          break;
        }
      }
    }
  }

  public decodeNextAction(state: State, agent: DQNAgent): Action | undefined {
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
      console.log('DECODE PLAYER TURN ACTION');
      return this.decodePlayerTurnAction(player, state, agent);
    }
  }

  private decodePlayerTurnAction(player: Player, state: State, agent: DQNAgent): Action {
    this.legalActions = [];
    const allPossibleActions: Action[] = [];
    for (let i = 0; i < this.possibleActions.length; i++) {
      const actions: Action[] = this.possibleActions[i].getPossibleActions(state, player);
      for (let j = 0; j < actions.length; j++) {
        const action: Action = actions[j];
        if (action !== undefined && this.isValidAction(state, action)) {
          allPossibleActions.push(action);
        }
      }
    }

    if (allPossibleActions.length == 0) {
      return new PassTurnAction(this.playerId);
    }

    // Need to preprocess state here
    // Need to filter actions that cannot be performed
    
    this.registerLegalActions(allPossibleActions);
    const preprocessedState = agent.preprocessGameState(state.players);
    const action_indexes = agent.getRankedActions(preprocessedState); // Get action indexes ranked in descending order
    const foundIndex = action_indexes.find(index => this.legalActions[index]);

    if (foundIndex !== undefined) {
      // console.log('LEGAL ACTION!!!!');
      // console.log(this.legalActions[foundIndex]);
      
      this.action_index = foundIndex;
      return this.legalActions[foundIndex];
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
