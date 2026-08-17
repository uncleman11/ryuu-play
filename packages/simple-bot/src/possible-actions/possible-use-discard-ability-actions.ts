import { Action, Player, State, UseAbilityAction, PlayerType, PokemonCard,
  SlotType, CardTarget } from '@ptcg/common';
import { PossibleActions } from './possible-actions';


export class PossibleUseDiscardAbilityActions extends PossibleActions {

  public getPossibleActions(state: State, player: Player): Action[] {
    const passTurnScore = this.options.scores.tactics.passTurn;
    const possibleActions: Action[] = [];

    player.discard.cards.forEach((card, index) => {
      if (!(card instanceof PokemonCard)) {
        return;
      }
      const target: CardTarget = {
        player: PlayerType.BOTTOM_PLAYER,
        slot: SlotType.DISCARD,
        index
      };
      for (const power of card.powers) {
        if (power.useFromDiscard) {
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
