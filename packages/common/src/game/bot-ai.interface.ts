import { DQNAgent } from '../ml';
import { Action, State } from '../store';

export interface BotAi {
  action_index: number;
  getPlayerId(): number;
  decodeNextAction(state: State, agent: DQNAgent): Action | undefined;
}

export abstract class BotAiFactory {
  constructor(public name: string) { }

  public abstract createBotAi(playerId: number, deck: string[] | null): BotAi;
}
