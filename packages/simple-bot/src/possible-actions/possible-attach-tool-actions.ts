import { Action, Player, State, PlayCardAction, TrainerCard, TrainerType,
  PlayerType} from '@ptcg/common';
import { PossibleActions } from './possible-actions';

export class PossibleAttachToolActions extends PossibleActions {

  public getPossibleActions(state: State, player: Player): Action[] {
    const tools = player.hand.cards.filter(c => {
      return c instanceof TrainerCard && c.trainerType === TrainerType.TOOL;
    });

    if (tools.length === 0) {
      return [];
    }

    const possibleActions: Action[] = [];
    const tool = tools[0] as TrainerCard;

    player.forEachPokemon(PlayerType.BOTTOM_PLAYER, (pokemonSlot, pokemon, target) => {
      if (pokemonSlot.trainers.cards.some(t => t.trainerType === TrainerType.TOOL)) {
        return;
      }

      pokemonSlot.trainers.cards.push(tool);
      pokemonSlot.trainers.cards.pop();

      possibleActions.push(new PlayCardAction(player.id, player.hand.cards.indexOf(tool), target));
    });

    return possibleActions;
  }

}
