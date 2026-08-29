import {
  Player, State, PassTurnAction, Action, GamePhase, Prompt,
  InvitePlayerPrompt, StateLog, ResolvePromptAction, GameLog, BotAi,
  Simulator, PlayCardAction, AttackAction, RetreatAction, UseAbilityAction,
  UseStadiumAction, UseTrainerInPlayAction, MCTSTree
} from '@ptcg/common';
import { PromptResolver } from './prompt-resolver/prompt-resolver';
import { PossibleActions } from './possible-actions/possible-actions';
import { SimpleBotOptions } from './simple-bot-options';

export class MachineLearningAi implements BotAi {

  private possibleActions: PossibleActions[];
  private n_actions: number = 131;
  private resolvers: PromptResolver[];
  public possibleActionOffsets: Map<string, number>;
  public action_index: number = -1;

  // Handle loops properly
  public max_action_retries: number = 4;
  public last_action_index: number = -1;
  public action_retries = 0;

  constructor(
    private playerId: number,
    options: SimpleBotOptions,
    private deck: string[] | null
  ) {
    this.possibleActions = options.tactics.map(tactic => new tactic(options));
    this.resolvers = options.promptResolvers.map(resolver => new resolver(options));
    this.n_actions = 131;
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

  public getLegalActions(possibleActions: Action[]): Action[] {
    const legalActions: Action[] = Array(this.n_actions).fill(null);
    for (let i = 0; i < possibleActions.length; i++) {
      const possibleAction: Action = possibleActions[i];
      let offset: number = -1;
      switch (possibleAction.type) {
        case 'PLAY_CARD_ACTION': {
          const action = possibleAction as PlayCardAction;
          offset = this.possibleActionOffsets.get(possibleAction.type) ?? -1;
          legalActions[offset + action.target.index * 6 + action.handIndex] = action;
          break;
        }
        case 'ATTACK_ACTION':
        {
          const action = possibleAction as AttackAction;
          offset = this.possibleActionOffsets.get(possibleAction.type) ?? -1;
          legalActions[offset + action.localIndex] = action;
          break;
        }
        case 'RETREAT_ACTION':
        {
          const action = possibleAction as RetreatAction;
          offset = this.possibleActionOffsets.get(possibleAction.type) ?? -1;
          legalActions[offset + action.benchIndex] = action;
          break;
        }
        case 'USE_ABILITY_ACTION':
        {
          const action = possibleAction as UseAbilityAction;
          offset = this.possibleActionOffsets.get(possibleAction.type) ?? -1;
          legalActions[offset + action.target.index] = action;
          break;
        }
        case 'USE_STADIUM_ACTION':
        {
          const action = possibleAction as UseStadiumAction;
          offset = this.possibleActionOffsets.get(possibleAction.type) ?? -1;
          legalActions[offset] = action;
          break;
        }
        case 'USE_TRAINER_IN_PLAY_ACTION':
        {
          const action = possibleAction as UseTrainerInPlayAction;
          offset = this.possibleActionOffsets.get(possibleAction.type) ?? -1;
          legalActions[offset * action.target.index] = action;
          break;
        }
      }
    }
    return legalActions;
  }

  public decodeNextAction(clientId: number, state: State, agent: PPO): Action | undefined {
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
      console.log('RETURN DECODE NEXT ACTION');
      return this.decodePlayerTurnAction(clientId, player, state, agent);
    }
  }

  private decodePlayerTurnAction(clientId: number, player: Player, state: State, agent: MCTSTree): [Action, number[]] {
    const mask: number[] = new Array(this.n_actions).fill(0);
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
      return [new PassTurnAction(this.playerId), mask];
    }

    // Need to filter actions that cannot be performed
    const legalActions = this.getLegalActions(allPossibleActions);
    const preprocessedState = agent.preprocessGameState(state.players);
    const legalIndexes: number[] = [];
    
    legalActions.forEach((legalAction, index) => {
      if(this.action_retries >= this.max_action_retries) {
        if(legalActions[index] !== null && index !== this.last_action_index){
          legalIndexes.push(index);
          mask[index] = 1;
        }
      }
      else if(legalActions[index] !== null){
        legalIndexes.push(index);
        mask[index] = 1;
      }
    });

    const actionIndex = agent.selectAction(clientId, preprocessedState, mask);
    if (actionIndex !== -1) {
      this.action_index = actionIndex;
      if (actionIndex == this.last_action_index) {
        this.action_retries++;
      }
      else {
        this.action_retries = 0;
      }

      this.last_action_index = actionIndex;
      return [legalActions[actionIndex], mask];
    }
    console.log('Return from Legal Pass decode Turn Action');
    return [new PassTurnAction(this.playerId), mask];
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
