import { randomUUID } from "crypto";
import { arenaManager } from "./ArenaManager.js";
import type { ArenaState, GamePlayer, PlayerCell } from "./types.js";
import { saveMatch } from "./MatchService.js";

const TICK_RATE = 25;
const TICK_INTERVAL_MS = 1000 / TICK_RATE;
const DELTA_TIME = 1 / TICK_RATE;

const MAP_WIDTH = 5000;
const MAP_HEIGHT = 5000;
const FOOD_MASS = 1;

/**
 * Rayon d'une cellule selon les règles du TP :
 * rayon = 4 * sqrt(masse)
 */
function getRadius(mass: number): number {
    return 4 * Math.sqrt(mass);
}

/**
 * Vitesse maximale selon les règles du TP :
 * vitesse = 400 / sqrt(masse)
 */
function getSpeed(mass: number): number {
    return 400 / Math.sqrt(mass);
}

/**
 * Déplace une cellule en fonction de l'intention du joueur.
 *
 * Le client fournit uniquement dx/dy.
 * Le serveur calcule lui-même la position.
 */
function moveCell(
    cell: PlayerCell,
    player: GamePlayer
): void {
    let { dx, dy } = player.input;

    const length = Math.sqrt(dx * dx + dy * dy);

    if (length === 0) {
        return;
    }

    // Normalisation pour empêcher un déplacement diagonal plus rapide
    dx /= length;
    dy /= length;

    const speed = getSpeed(cell.mass);
    const distance = speed * DELTA_TIME;

    cell.x += dx * distance;
    cell.y += dy * distance;

    // La cellule doit rester entièrement dans l'arène
    const radius = getRadius(cell.mass);

    cell.x = Math.max(
        radius,
        Math.min(MAP_WIDTH - radius, cell.x)
    );

    cell.y = Math.max(
        radius,
        Math.min(MAP_HEIGHT - radius, cell.y)
    );
}

/**
 * Vérifie si une cellule absorbe de la nourriture.
 *
 * Une nourriture absorbée :
 * - ajoute sa masse à la cellule ;
 * - est supprimée ;
 * - est immédiatement remplacée.
 *
 * L'arène conserve donc toujours 1000 nourritures.
 */
function handleFoodAbsorption(arena: ArenaState): void {
    for (const player of arena.players.values()) {
        for (const cell of player.cells) {
            const radius = getRadius(cell.mass);

            for (const [foodId, food] of arena.food) {
                const dx = cell.x - food.x;
                const dy = cell.y - food.y;

                const distance = Math.sqrt(
                    dx * dx + dy * dy
                );

                if (distance < radius) {
                    // La nourriture du TP a une masse de 1
                    cell.mass += food.mass;


                    arena.food.delete(foodId);

                    const newFoodId = randomUUID();

                    arena.food.set(newFoodId, {
                        id: newFoodId,
                        x: Math.random() * MAP_WIDTH,
                        y: Math.random() * MAP_HEIGHT,
                        mass: FOOD_MASS
                    });
                }
            }
        }
    }
}

/**
 * Vérifie les absorptions entre cellules de joueurs.
 */
function handlePlayerAbsorption(arena: ArenaState): void {
    const players = Array.from(arena.players.values());

    for (const attacker of players) {
        for (const victim of players) {
            // Un joueur ne peut pas s'absorber lui-même
            if (attacker.id === victim.id) {
                continue;
            }

            for (const attackerCell of attacker.cells) {
                for (const victimCell of victim.cells) {
                    // A doit avoir au moins 10 % de masse en plus que B
                    if (attackerCell.mass < 1.1 * victimCell.mass) {
                        continue;
                    }

                    const dx = attackerCell.x - victimCell.x;
                    const dy = attackerCell.y - victimCell.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    const attackerRadius = getRadius(attackerCell.mass);
                    const victimRadius = getRadius(victimCell.mass);

                    const canAbsorb =
                        distance <
                        attackerRadius - 0.4 * victimRadius;

                    if (!canAbsorb) {
                        continue;
                    }

                    // L'attaquant récupère la masse de la cellule absorbée
                    attackerCell.mass += victimCell.mass;

            // Mise à jour de la masse maximale atteinte
                    const totalMass = attacker.cells.reduce(
                        (sum, cell) => sum + cell.mass,
                        0
                    );

                    attacker.maxMass = Math.max(attacker.maxMass, totalMass);

            // Suppression de la cellule absorbée
                    victim.cells = victim.cells.filter(
                        (cell) => cell.id !== victimCell.id
                    );

            // Le joueur meurt lorsqu'il n'a plus aucune cellule
                    if (victim.cells.length === 0) {
                        attacker.kills++;

                        // Retire immédiatement le joueur mort de l'arène
                        arena.players.delete(victim.id);

                        // Enregistre sa partie sans bloquer la boucle de jeu
                        void saveMatch(arena.id, victim, attacker.username)
                            .then(() => {
                                console.log(
                                    `MATCH_SAVED player=${victim.username} arena=${arena.id}`
                                );
                            })
                            .catch((error: unknown) => {
                                console.error(
                                    `MATCH_SAVE_FAILED player=${victim.username}`,
                                    error
                                );
                            });
                    }
                }
            }
        }
    }
}

/**
 * Exécute un tick d'une arène.
 */
function updateArena(arena: ArenaState): void {
    arena.tick++;

    // Déplacement des joueurs
    for (const player of arena.players.values()) {
        for (const cell of player.cells) {
            moveCell(cell, player);
        }
    }

    // Absorption de la nourriture
    handleFoodAbsorption(arena);
    handlePlayerAbsorption(arena);
}

/**
 * Boucle principale du serveur de jeu.
 *
 * 25 ticks/s = un tick toutes les 40 ms.
 */
export function startGameLoop(): NodeJS.Timeout {
    return setInterval(() => {
        for (const arena of arenaManager.getArenas()) {
            updateArena(arena);
        }
    }, TICK_INTERVAL_MS);
}