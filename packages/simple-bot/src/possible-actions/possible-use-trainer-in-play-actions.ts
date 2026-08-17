import { Action, Player, State, TrainerCard, UseTrainerInPlayAction, PlayerType } from '@ptcg/common';
import { PossibleActions } from './possible-actions';

export class PossibleTrainerInPlayActions extends PossibleActions {

  public getPossibleActions(state: State, player: Player): Action[] {
    const possibleActions: Action[] = [];
    const passTurnScore = this.options.scores.tactics.passTurn;

    player.forEachPokemon(PlayerType.BOTTOM_PLAYER, (pokemonSlot, card, target) => {
      const trainers = [
        ...pokemonSlot.pokemons.cards,
        ...pokemonSlot.energies.cards,
        ...pokemonSlot.trainers.cards,
      ].filter(c => c instanceof TrainerCard) as TrainerCard[];

      for (const trainer of trainers) {
        if (trainer.useWhenInPlay) {
          const action = new UseTrainerInPlayAction(player.id, target, trainer.name);
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
