import { MCTSTree } from '../ml';
import { Action, State } from '../store';

export interface BotAi {
  action_index: number;
  getPlayerId(): number;
  decodeNextAction(clientId: number, state: State, agent: MCTSTree): Action | undefined;
}

export abstract class BotAiFactory {
  constructor(public name: string) { }

  public abstract createBotAi(playerId: number, deck: string[] | null): BotAi;
}
