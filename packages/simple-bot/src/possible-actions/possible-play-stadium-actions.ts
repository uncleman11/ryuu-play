import { Action, Player, State, TrainerCard, TrainerType, PlayCardAction,
  PlayerType, SlotType, StateUtils } from '@ptcg/common';
import { PossibleActions } from './possible-actions';

export class PossiblePlayStadiumActions extends PossibleActions {

  public getPossibleActions(state: State, player: Player): Action[] {
    // Don't discard your own stadium cards
    if (player.stadiumPlayedTurn >= state.turn || player.stadium.cards.length > 0) {
      return [];
    }

    let stadiums = player.hand.cards.filter(c => {
      return c instanceof TrainerCard && c.trainerType === TrainerType.STADIUM;
    });

    // Don't play stadiums of the same name as current stadium
    const currentStadium = StateUtils.getStadiumCard(state);
    if (currentStadium) {
      stadiums = stadiums.filter(c => c.fullName !== currentStadium.fullName);
    }

    const possibleActions: Action[] = [];
    for (let i = 0; i < stadiums.length; i++) {
      possibleActions.push(
        new PlayCardAction(
          player.id,
          player.hand.cards.indexOf(stadiums[i]),
          { player: PlayerType.ANY, slot: SlotType.BOARD, index: 0 }
        )
      );
    }
    return possibleActions;
  }
}
