import { Action, Card, Player, State, PokemonCard, Stage, PlayCardAction } from '@ptcg/common';
import { PossibleActions } from './possible-actions';

export class PossiblePlayBasicActions extends PossibleActions {

  public getPossibleActions(state: State, player: Player): Action[] {
    const emptyBenchSlot = player.bench
      .find(b => b.pokemons.cards.length === 0);

    if(!emptyBenchSlot) {
      return [];
    }
    const possibleActions: Action[] = [];

    for (let i = 0; i < player.hand.cards.length; i++) {
      const card: Card = player.hand.cards[i];
      if(card instanceof PokemonCard && card.stage === Stage.BASIC) {
        possibleActions.push(
          new PlayCardAction(
            player.id,
            player.hand.cards.indexOf(card),
            this.getCardTarget(player, state, emptyBenchSlot)
          )
        );
      }
    }
    return possibleActions;
  }

}
