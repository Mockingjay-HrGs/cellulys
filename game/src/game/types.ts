export interface PlayerCell {
    id: string;
    x: number;
    y: number;
    mass: number;
}

export interface GamePlayer {
    id: string;
    username: string;
    cells: PlayerCell[];
    input: {
        dx: number;
        dy: number;
        seq: number;
    };

    connectedAt: number;
    startedAt: Date;
    maxMass: number;
    kills: number;

}

export interface Food {
    id: string;
    x: number;
    y: number;
    mass: number;
}

export interface ArenaState {
    id: string;

    width: number;
    height: number;

    tick: number;

    players: Map<string, GamePlayer>;

    food: Map<string, Food>;
}