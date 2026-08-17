import { Action, Player, State, RetreatAction } from '@ptcg/common';
import { PossibleActions } from './possible-actions';

export class PossibleRetreatTacticActions extends PossibleActions {

  public getPossibleActions(state: State, player: Player): Action[] {

    if (player.retreatedTurn === state.turn) {
      return [];
    }

    const possibleActions: Action[] = [];
    player.bench.forEach((bench, index) => {
      if (bench.pokemons.cards.length === 0) {
        return;
      }

      const action = new RetreatAction(player.id, index);
      const score = this.evaluateAction(state, player.id, action);

      if (score !== undefined) {
        possibleActions.push(action);
      }
    });

    return possibleActions;
  }

}
