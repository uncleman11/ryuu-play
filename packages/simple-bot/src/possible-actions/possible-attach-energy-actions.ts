import { Action, Player, State, EnergyCard, PlayCardAction,
  PlayerType} from '@ptcg/common';
import { PossibleActions } from './possible-actions';

export class PossibleAttachEnergyActions extends PossibleActions {

  public getPossibleActions(state: State, player: Player): Action[] {
    if (player.energyPlayedTurn >= state.turn) {
      return [];
    }

    // Distinct list with player's energies.
    const energies: EnergyCard[] = [];
    player.hand.cards.forEach(c => {
      if (c instanceof EnergyCard && !energies.some(e => e.fullName === c.fullName)) {
        energies.push(c);
      }
    });

    if (energies.length === 0) {
      return [];
    }
    
    const possibleActions: Action[] = [];
    player.forEachPokemon(PlayerType.BOTTOM_PLAYER, (pokemonSlot, pokemon, target) => {

      for (const card of energies) {
        pokemonSlot.energies.cards.push(card);
        pokemonSlot.energies.cards.pop();
        possibleActions.push(new PlayCardAction(player.id, player.hand.cards.indexOf(card), target));
      }
    });
    return possibleActions;
  }

}
