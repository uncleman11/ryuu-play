import { Action, Player, State, Stage, PlayCardAction, TrainerCard, TrainerType, PokemonCard, SuperType } from '@ptcg/common';
import { PossibleActions } from './possible-actions';

export class PossiblePlayFossilActions extends PossibleActions {

  public getPossibleActions(state: State, player: Player): Action[] {
    const trainers = player.hand.cards
      .filter(c => c.superType === SuperType.TRAINER
        && (c as TrainerCard).trainerType === TrainerType.ITEM
        && (c as PokemonCard).stage === Stage.BASIC
        && (c as PokemonCard).hp > 0
      );

    const emptyBenchSlot = player.bench.find(b => b.pokemons.cards.length === 0);

    if (trainers.length === 0 || !emptyBenchSlot) {
      return [];
    }

    const target = this.getCardTarget(player, state, emptyBenchSlot);
    const possibleActions: Action[] = [];

    trainers.forEach(card => {
      const index = player.hand.cards.indexOf(card);
      possibleActions.push(new PlayCardAction(player.id, index, target));
    });

    return possibleActions;
  }

}
