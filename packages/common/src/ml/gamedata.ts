/**
 * A simplified Game State. 
 * In your real app, this would be the result of your preprocessGameState function.
 */

export class GameDataPoint {
  public state: number[];
  public action: number;
  public reward: number;
  public nextState: number[];
  public done: boolean;
  public mask: number[];

  public constructor(state: number[], action: number, reward: number, nextState: number[], done: boolean, mask) {
    this.state = state;
    this.action = action;
    this.reward = reward;
    this.nextState = nextState;
    this.done = done;
    this.mask = mask;
  }
}

export class GameData {
  private gameDataPoints: GameDataPoint[];
  private isOver: boolean = false;
  private gamma = 0.4;
  private cumulativeRewards: number[];

  constructor() {
    this.gameDataPoints = [];
    this.cumulativeRewards = [];
  }

  add(gameDataPoint: GameDataPoint): void {
    if(this.isOver)
    {
      this.gameDataPoints.push(gameDataPoint);
    }
    else {
      throw new Error('Final state already present in datapoints!');
    }
    if(gameDataPoint.done) {
      this.isOver = true;
      this.computeCumulativeRewards();
    }
  }

  private computeCumulativeRewards() {
    if(!this.isOver) {
      throw new Error('Game is not over yet, shouldn\'t compute rewards!');
    }
    this.cumulativeRewards = this.getRewards();
    let runningSum = 0;

    // Iterate backwards from the end of the array
    for (let i = this.cumulativeRewards.length - 1; i >= 0; i--) {
      // Gt = Rt + gamma * G(t+1)
      runningSum = this.cumulativeRewards[i] + Math.pow(this.gamma,this.cumulativeRewards.length -1 -i) * runningSum;
      this.cumulativeRewards[i] = runningSum;
    }
  }

  public sample(batchSize: number): GameDataPoint[] {
    const samples: GameDataPoint[] = [];
    for (let i = 0; i < batchSize; i++) {
      const index = Math.floor(Math.random() * this.gameDataPoints.length);
      samples.push(this.gameDataPoints[index]);
    }
    return samples;
  }


  getStates(): Array<number[]> {
    return this.gameDataPoints.map(point => point.state);
  }

  getActions(): Array<number> {
    return this.gameDataPoints.map(point => point.action);
  }

  getRewards(): Array<number> {
    return this.gameDataPoints.map(point => point.reward);
  }

  getNextStates(): Array<number[]> {
    return this.gameDataPoints.map(point => point.nextState);
  }

  getMasks(): Array<number[]> {
    return this.gameDataPoints.map(point => point.mask);
  }

  getDones(): Array<boolean> {
    return this.gameDataPoints.map(point => point.done);
  }

  getLength(): number {
    return this.gameDataPoints.length;
  }
}
