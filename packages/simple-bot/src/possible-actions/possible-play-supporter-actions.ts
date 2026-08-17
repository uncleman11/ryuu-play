import { Action, Player, State, TrainerCard, TrainerType, PlayCardAction,
  PlayerType, SlotType } from '@ptcg/common';
import { PossibleActions } from './possible-actions';

export class PossiblePlaySupporterActions extends PossibleActions {

  public getPossibleActions(state: State, player: Player): Action[] {
    if (player.supporter.cards.length > 0) {
      return [];
    }

    const supporters = player.hand.cards.filter(c => {
      return c instanceof TrainerCard && c.trainerType === TrainerType.SUPPORTER;
    });

    if (supporters.length === 0) {
      return [];
    }

    const possibleActions: Action[] = [];
    const target = { player: PlayerType.ANY, slot: SlotType.BOARD, index: 0 };

    supporters.forEach(card => {
      const index = player.hand.cards.indexOf(card);
      const action = new PlayCardAction(player.id, index, target);
      const score = this.evaluateAction(state, player.id, action);

      if (score !== undefined) {
        possibleActions.push(action);
      }
    });

    return possibleActions;
  }

}
