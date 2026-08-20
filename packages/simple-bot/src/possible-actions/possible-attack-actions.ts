import { Action, Player, State, SpecialCondition, AttackAction } from '@ptcg/common';
import { PossibleActions } from './possible-actions';

export class PossibleAttackActions extends PossibleActions {

  public getPossibleActions(state: State, player: Player): Action[] {
    const sp = player.active.specialConditions;
    if (sp.includes(SpecialCondition.PARALYZED) || sp.includes(SpecialCondition.ASLEEP)) {
      return [];
    }

    const active = player.active.getPokemonCard();
    if (!active) {
      return [];
    }
    
    const possibleActions: Action[] = [];
    active.attacks.forEach((attack, localIndex) => {
      const action = new AttackAction(player.id, attack.name, localIndex);
      const score = this.evaluateAction(state, player.id, action);

      if (score !== undefined) {
        possibleActions.push(action);
      }
    });
    return possibleActions;
  }
}
