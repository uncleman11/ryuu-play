import { SimpleBotOptions } from './simple-bot-options';
import { 
  // allSimpleTactics,
  allPossibleActions,
  allPromptResolvers, defaultStateScores,
  defaultArbiterOptions } from './simple-bot-definitions';
import { BotAi, BotAiFactory } from '@ptcg/common';
import { MachineLearningAi } from './machine-learning-ai';


export class SimpleBot extends BotAiFactory {

  private options: SimpleBotOptions;

  constructor(name: string, options: Partial<SimpleBotOptions> = {}) {
    super(name);
    this.options = Object.assign({
      tactics: allPossibleActions,
      promptResolvers: allPromptResolvers,
      scores: defaultStateScores,
      arbiter: defaultArbiterOptions
    }, options);
  }

  public createBotAi(playerId: number, deck: string[] | null): BotAi {
    return new MachineLearningAi(playerId, this.options, deck);
  }

}
