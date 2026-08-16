import { CardManager, GameSettings, Rules } from '@ptcg/common';

import { BotClient } from './bot-client';
import { Scheduler } from '../../utils/scheduler';
import { config } from '../../config';

// interface BotsForGame {
//   deck: string[]
//   bot1: BotClient,
//   bot2: BotClient,
//   format: Format
// }

export class BotGamesTask {

  private bots: BotClient[] = [];
  private decks: any = {'Rain Dance': {
    name: 'Rain Dance',
    cards:
      [
        'Blastoise BS',
        'Blastoise BS',
        'Blastoise BS',
        'Squirtle BS',
        'Squirtle BS',
        'Squirtle BS',
        'Squirtle BS',
        'Gyarados BS',
        'Gyarados BS',
        'Gyarados BS',
        'Wartortle BS',
        'Bill BS',
        'Bill BS',
        'Bill BS',
        'Super Energy Removal BS',
        'Magikarp BS',
        'Magikarp BS',
        'Magikarp BS',
        'Magikarp BS',
        'Lass BS',
        'Switch BS',
        'Switch BS',
        'Switch BS',
        'Item Finder BS',
        'Item Finder BS',
        'Maintenance BS',
        'Professor Oak BS',
        'Professor Oak BS',
        'Professor Oak BS',
        'Professor Oak BS',
        'Super Potion BS',
        'Super Potion BS',
        'Super Potion BS',
        'Computer Search BS',
        'Computer Search BS',
        'Computer Search BS',
        'Computer Search BS',
        'Pokémon Breeder BS',
        'Pokémon Breeder BS',
        'Pokémon Breeder BS',
        'Pokémon Breeder BS',
        'Energy Retrieval BS',
        'Energy Retrieval BS',
        'Energy Retrieval BS',
        'Energy Retrieval BS',
        'Water Energy BS',
        'Water Energy BS',
        'Water Energy BS',
        'Water Energy BS',
        'Water Energy BS',
        'Water Energy BS',
        'Water Energy BS',
        'Water Energy BS',
        'Water Energy BS',
        'Water Energy BS',
        'Water Energy BS',
        'Water Energy BS',
        'Water Energy BS',
        'Water Energy BS',
        'Chansey BS'
      ],
    formatName: 'Base Sets'
  },
  'Machakazam': {
    name: 'Machakazam',
    cards: [
      'Machop BS',
      'Machop BS',
      'Machop BS',
      'Machoke BS',
      'Machoke BS',
      'Machamp BS',
      'Machamp BS',
      'Abra BS',
      'Abra BS',
      'Abra BS',
      'Abra BS',
      'Pokémon Breeder BS',
      'Pokémon Breeder BS',
      'Chansey BS',
      'Chansey BS',
      'Chansey BS',
      'Chansey BS',
      'Pokémon Center BS',
      'Pokémon Center BS',
      'Lass BS',
      'Double Colorless Energy XY',
      'Double Colorless Energy XY',
      'Double Colorless Energy XY',
      'Double Colorless Energy XY',
      'Maintenance BS',
      'Pokémon Trader BS',
      'Pokémon Trader BS',
      'Computer Search BS',
      'Computer Search BS',
      'Kadabra BS',
      'Kadabra BS',
      'Item Finder BS',
      'Item Finder BS',
      'Item Finder BS',
      'Alakazam BS',
      'Alakazam BS',
      'Alakazam BS',
      'Doduo BS',
      'Energy Retrieval BS',
      'Energy Retrieval BS',
      'Energy Retrieval BS',
      'Energy Retrieval BS',
      'Switch BS',
      'Switch BS',
      'Switch BS',
      'Professor Oak BS',
      'Professor Oak BS',
      'Professor Oak BS',
      'Fighting Energy BS',
      'Fighting Energy BS',
      'Fighting Energy BS',
      'Fighting Energy BS',
      'Fighting Energy BS',
      'Fighting Energy BS',
      'Fighting Energy BS',
      'Fighting Energy BS',
      'Fighting Energy BS',
      'Fighting Energy BS',
      'Fighting Energy BS',
      'Fighting Energy BS'
    ],
    formatName: 'Base Sets'
  }};

  private experiments = [['Rain Dance', 'Machakazam'], ['Machakazam', 'Machakazam']];

  constructor(bots: BotClient[]) {
    this.bots = bots;
  }

  // public startBotGames() {
  //   const scheduler = Scheduler.getInstance();
  //   scheduler.run(async () => {
  //     const botsForGame = await this.getRandomBotsForGame();

  //     // Create the game if successfuly selected two bots
  //     if (botsForGame !== undefined) {
  //       const { bot1, bot2, deck, format } = botsForGame;

  //       // Use rules from given format
  //       const rules = new Rules(format.rules);
  //       rules.formatName = format.name;
  //       const gameSettings = new GameSettings();
  //       gameSettings.rules = rules;

  //       bot1.createGame(deck, gameSettings, bot2);
  //     }
  //   }, config.bots.botGamesIntervalCount);
  // }

  public startBotGames() {
    const cardManager = CardManager.getInstance();
    const scheduler = Scheduler.getInstance();
    
    // Allow all cards for experiments
    const experimentsFormat = {
      name: '',
      cards: cardManager.getAllCards(),
      ranges: [],
      rules: new Rules()
    };
    scheduler.run(async () => {
      const botCouples = await this.getRandomBotsForExperiments();
      // Create the game if successfuly selected two bots
      if (botCouples !== undefined) {
        // const { bot1, bot2, deck, format } = botsForGame;
        for (const [bot1, bot2] of botCouples) {
          // Use rules from given format
          const rules = new Rules(experimentsFormat.rules);
          rules.formatName = experimentsFormat.name;
          const gameSettings = new GameSettings();
          gameSettings.rules = rules;
          bot1.createGame(bot1.defaultDeck, gameSettings, bot2);
        }
      }
    }, config.bots.botGamesIntervalCount);
  }

  // private getFormats(): Format[] {
  //   const cardManager = CardManager.getInstance();
  //   const formats = cardManager.getAllFormats().slice();
  //   const len = formats.length;

  //   // Shuffle the available formats
  //   for (let i = len - 1; i > 0; i--) {
  //     const position = Math.floor(Math.random() * (i+1));
  //     [formats[i], formats[position]] = [formats[position], formats[i]];
  //   }

  //   // Append Unlimited as last format to try
  //   formats.push({
  //     name: '',
  //     cards: cardManager.getAllCards(),
  //     ranges: [],
  //     rules: new Rules()
  //   });

  //   return formats;
  // }

  // private async getRandomBotsForGame(): Promise<BotsForGame | undefined> {
  //   const formats = this.getFormats();

  //   // Try each format one by one
  //   for (const format of formats) {
  //     const allBots = this.bots.slice();
  //     const bots: BotClient[] = [];
  //     const decks: Array<string[]> = [];

  //     // Find two random bots for the game
  //     while (bots.length < 2 && allBots.length > 0) {
  //       const botIndex = Math.round(Math.random() * (allBots.length - 1));
  //       const bot = allBots[botIndex];
  //       allBots.splice(botIndex, 1);
  //       try {
  //         const deck = await bot.loadDeck(format.name);
  //         bots.push(bot);
  //         decks.push(deck);
  //       } catch {
  //         // No deck available for given format.
  //         // Continue regardless of error.
  //       }
  //     }

  //     // Successfuly selected two bots
  //     if (bots.length === 2) {
  //       return { bot1: bots[0], bot2: bots[1], deck: decks[0], format };
  //     }
  //   }
  // }

  private async getRandomBotsForExperiments(): Promise<Array<[BotClient, BotClient]>> {
    const results: Array<[BotClient, BotClient]> = [];
    // Create a copy of the pool to track available bots across the experiment
    const allBots = [...this.bots];

    for (const [deckName1, deckName2] of this.experiments) {
      const botsInPair: BotClient[] = [];

      // We need to find 2 bots for these 2 specific names
      const targetNames = [deckName1, deckName2];
      console.log(targetNames);

      for (const name of targetNames) {
        // let botFoundForThisName = false;

        for (let i = 0; i < allBots.length; i++) {
          const bot = allBots[i];
          try {
            const deck = await bot.loadDeckByName(name);

            if (deck.length === 0) {
              // Deck for the bot doesn't exist, create it.
              // Note: You need a way to look up the cards for the dynamic 'name'.
              // Replace 'this.getCardsForName(name)' with your actual data lookup logic.
              const cards = this.decks[name].cards;
              await bot.createDeck(name, cards);
              bot.defaultDeck = cards;
            }
            else {
              console.log('Deck exists for bot ' + bot.id);
            }

            botsInPair.push(bot);
            // Remove from the pool so the same bot isn't used twice in one experiment
            allBots.splice(i, 1);
            // botFoundForThisName = true;
            break;
          } catch (e) {
            // If loading/creating fails for this specific bot, try the next one
            continue;
          }
        }
      }

      // Only add to results if we successfully found bots for both decks in the tuple
      if (botsInPair.length === 2) {
        results.push([botsInPair[0], botsInPair[1]]);
      }
      console.log('Results!');
      console.log(results);
    }
    return results;
  }
}
