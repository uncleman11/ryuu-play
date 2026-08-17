import { Action, Player, State, UseAbilityAction, PlayerType } from '@ptcg/common';
import { PossibleActions } from './possible-actions';

export class PossibleUseAbilityActions extends PossibleActions {

  public getPossibleActions(state: State, player: Player): Action[] {
    const possibleActions: Action[] = [];
    const passTurnScore = this.options.scores.tactics.passTurn;

    player.forEachPokemon(PlayerType.BOTTOM_PLAYER, (cardList, card, target) => {
      for (const power of card.powers) {
        if (power.useWhenInPlay) {
          const action = new UseAbilityAction(player.id, power.name, target);
          const score = this.evaluateAction(state, player.id, action, passTurnScore);

          if (score !== undefined) {
            possibleActions.push(action);
          }
        }
      }
    });

    return possibleActions;
  }

}
