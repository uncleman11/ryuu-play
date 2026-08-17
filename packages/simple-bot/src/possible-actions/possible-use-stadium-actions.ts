import { Action, Player, State, UseStadiumAction, StateUtils } from '@ptcg/common';
import { PossibleActions } from './possible-actions';

export class PossibleUseStadiumActions extends PossibleActions {

  public getPossibleActions(state: State, player: Player): Action[] {
    if (player.stadiumUsedTurn >= state.turn) {
      return [];
    }

    if (StateUtils.getStadiumCard(state) === undefined) {
      return [];
    }

    const passTurnScore = this.options.scores.tactics.passTurn;
    const action = new UseStadiumAction(player.id);
    const score = this.evaluateAction(state, player.id, action, passTurnScore);


    if (score !== undefined) {
      return [action];
    }
    return [];
  }

}
