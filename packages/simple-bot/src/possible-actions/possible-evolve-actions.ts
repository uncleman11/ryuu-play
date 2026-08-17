import { Action, Player, State, PokemonCard, PlayerType, CardTarget, PlayCardAction } from '@ptcg/common';
import { PossibleActions } from './possible-actions';

export class PossibleEvolveActions extends PossibleActions {

  public getPossibleActions(state: State, player: Player): Action[] {
    const pokemons: {card: PokemonCard, target: CardTarget}[] = [];

    player.forEachPokemon(PlayerType.BOTTOM_PLAYER, (pokemonSlot, card, target) => {
      if (pokemonSlot.pokemonPlayedTurn !== state.turn) {
        pokemons.push({ card, target });
      }
    });

    const possibleActions: Action[] = [];
    for (let i = 0; i < pokemons.length; i++) {
      const evolution = player.hand.cards.find(c => {
        return c instanceof PokemonCard && c.evolvesFrom === pokemons[i].card.name;
      });
      if (evolution) {
        possibleActions.push(
          new PlayCardAction(
            player.id,
            player.hand.cards.indexOf(evolution),
            pokemons[i].target
          )
        );
      }
    }
    return possibleActions;
  }

}
