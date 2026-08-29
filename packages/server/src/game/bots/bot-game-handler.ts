import { Action, BotAi, BotAiFactory } from '@ptcg/common';
import { MCTSTree, State } from '@ptcg/common';
import { Client } from '../client/client.interface';
import { Game } from '../core/game';
import { config } from '../../config';

export class BotGameHandler {

  private ai: BotAi | undefined;
  private state: State | undefined;
  private changeInProgress: boolean = false;
  private agent: MCTSTree;

  constructor(
    private client: Client,
    private botAiFactory: BotAiFactory,
    public game: Game,
    deckPromise: Promise<string[]>,
    agent: MCTSTree
  ) {
    this.agent = agent;
    this.waitForDeck(deckPromise);
  }

  public async onStateChange(state: State): Promise<void> {
    if (!this.ai || this.changeInProgress) {
      this.state = state;
      return;
    }

    this.state = undefined;
    this.changeInProgress = true;

    const action = this.ai.decodeNextAction(this.client.id, state, this.agent);
    const action_index = this.ai.action_index;

    if (action) {
      await this.waitAndDispatch(action, action_index);
    }

    this.changeInProgress = false;
    // A state change was ignored, because we were processing
    if (this.state) {
      this.onStateChange(this.state);
    }
  }

  private async waitForDeck(deckPromise: Promise<string[]>): Promise<void> {
    let deck: string[] | null = null;
    try {
      deck = await deckPromise;
    } catch (error) {
      // continue regardless of error
    }

    this.ai = this.botAiFactory.createBotAi(this.client.id, deck);

    // A state change was ignored, because we were loading the deck
    if (this.state) {
      this.onStateChange(this.state);
    }
  }

  private async waitAndDispatch(action: Action, action_index: number): Promise<void> {
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    try {
      // 1. Wait for the delay first
      await sleep(config.bots.actionDelay);

      // 2. Execute your logic
      const nextState: State = this.game.dispatch(this.client, action);
      
      // 3. Now you can await this call!
      if(this.ai != undefined && this.state != undefined) {
        await this.agent.update(
          this.game.id,
          this.client.id, 
          this.ai.getPlayerId(), 
          this.state.players,
          action_index, 
          nextState.players
        );
      }
      
      console.log('DISPATCHED ACTION:' + this.client.id);
      console.log(action_index);
      console.log(action);
    } catch (error) {
      console.log('ERROR');
      console.log(error);
      // Continue regardless of error as per your original logic
    }
  }

}
