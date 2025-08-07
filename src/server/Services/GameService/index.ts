import { KnitServer as Knit, RemoteSignal } from "@rbxts/knit";
import { Players, ServerStorage, Workspace } from "@rbxts/services";
import Constants from "shared/Modules/Constants";

declare global {
    interface KnitServices {
        GameService: typeof GameService;
    }
}

/* DOCUMENTATION | dnshijacking 7/28/2025 
StartRound() | Return NIL
-Executes a full round cycle: selects a non-repeating target color, assigns pad colors with decreasing correct fraction, teleports players, tracks eliminations, updates screens, and handles cleanup.

KnitStart() | Return NIL
-Main game loop: handles intermission countdowns, fires lobby/round phase signals, and triggers rounds continuously.

isPlayerOnCorrectPad(player, targetColor, padsRoot) | Return BOOL
-Determines whether the given player is standing on a pad matching the current target color.

getLoserSpawnCFrame() | Return CFrame or nil
-Retrieves the teleport destination for eliminated players in the loser area.

teleportCharacterToPart(character, part) | Return NIL
-Moves the given character to the specified pad.

computePadDistances(pads, activePlayers) | Return TABLE
-Computes the closest distance from each pad to any active player.

weightedSample(padList, weights, count) | Return ARRAY
-Selects count, unique pads from padList preferring higher weights.
*/

const GameService = Knit.CreateService({
    Name: "GameService",

    Client: {
        // Signals for client (remote events):
        UpdateCountdown: new RemoteSignal<(count: number) => void>(),
        NewTargetColor: new RemoteSignal<(target: { Name: string; Color: Color3 }) => void>(),
        UpdatePhase: new RemoteSignal<(phase: string) => void>(),
    },

    // Teleports the given character to the specified part.
    teleportCharacterToPart(character: Model | undefined, part: BasePart | undefined) {
        if (!character || !part) return;
        const hrp = character.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
        if (!hrp) return;
        const attachment = part.FindFirstChild("TeleportLocation") || part.FindFirstChildWhichIsA("Attachment");
        if (attachment && attachment.IsA("Attachment")) {
            hrp.CFrame = new CFrame(attachment.WorldPosition);
        } else {
            hrp.CFrame = part.CFrame.add(new Vector3(0, 5, 0));
        }
    },

    // Retrieves the teleport destination CFrame for eliminated players (loser area).
    getLoserSpawnCFrame(): CFrame | undefined {
        const loserArea = Workspace.FindFirstChild("LooserArea") || Workspace.FindFirstChild("LoserArea");
        if (!loserArea) return undefined;
        const loserPad = loserArea.FindFirstChild("LooserPad") || loserArea.FindFirstChild("LoserPad");
        if (!loserPad || !loserPad.IsA("BasePart")) return undefined;
        const attachment = loserPad.FindFirstChild("TeleportLocation");
        if (attachment && attachment.IsA("Attachment")) {
            return new CFrame(attachment.WorldPosition);
        } else {
            return loserPad.CFrame.add(new Vector3(0, 5, 0));
        }
    },

    // Determines if the player is currently standing on a pad of the correct target color.
    isPlayerOnCorrectPad(player: Player, targetColor: { Name: string; Color: Color3 }, padsRoot: Instance) {
        const character = player.Character;
        if (!character) return false;
        const hrp = character.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
        if (!hrp) return false;
        const rayParams = new RaycastParams();
        rayParams.FilterDescendantsInstances = [character];
        rayParams.FilterType = Enum.RaycastFilterType.Exclude;
        const result = Workspace.Raycast(hrp.Position, new Vector3(0, -10, 0), rayParams);
        if (result && result.Instance && result.Instance.IsA("BasePart")) {
            const part = result.Instance;
            if (padsRoot && part.IsDescendantOf(padsRoot)) {
                if (part.Color.equals(targetColor.Color)) {
                    return true;
                }
            }
        }
        return false;
    },

    // Computes the closest distance from each pad in `pads` to any active player.
    computePadDistances(pads: BasePart[], activePlayers: Map<Player, boolean>) {
        const distances = new Map<BasePart, number>();
        for (const pad of pads) {
            if (pad.IsA("BasePart")) {
                let closest = math.huge;
                const padPos = pad.Position;
                activePlayers.forEach((_, player) => {
                    const hrp = player.Character?.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
                    if (hrp) {
                        const d = hrp.Position.sub(padPos).Magnitude;
                        if (d < closest) {
                            closest = d;
                        }
                    }
                });
                distances.set(pad, closest);
            }
        }
        return distances;
    },

    // Selects `count` unique pads from padList, preferring pads with higher weights.
    weightedSample(padList: BasePart[], weights: Map<BasePart, number>, count: number) {
        const result: BasePart[] = [];
        const pool = padList.slice(); // copy list
        for (let i = 1; i <= count; i++) {
            if (pool.size() === 0) break;
            let totalWeight = 0;
            for (const pad of pool) {
                totalWeight += weights.get(pad) ?? 0;
            }
            if (totalWeight <= 0) {
                // If all weights are zero, just take the first pad
                const pad = pool.shift();
                if (pad) result.push(pad);
            } else {
                const pick = math.random() * totalWeight;
                let running = 0;
                let chosenIndex = 0;
                for (let idx = 0; idx < pool.size(); idx++) {
                    const pad = pool[idx];
                    running += weights.get(pad) ?? 0;
                    if (pick <= running) {
                        chosenIndex = idx;
                        break;
                    }
                }
                // Select and remove the chosen pad
                const chosenPad = pool[chosenIndex];
                result.push(chosenPad);
                pool.splice(chosenIndex, 1);
            }
        }
        return result;
    },

    // Starts a new round of the game. Manages pad color assignment, timing, and elimination.
    StartRound() {
        // Notify clients that the phase is now "Round"
        this.Client.UpdatePhase.FireAll("Round");

        // Clone the map from ServerStorage (if available)
        const mapsFolder = ServerStorage.FindFirstChild("Maps");
        const overworld = mapsFolder && mapsFolder.IsA("Folder") ? mapsFolder.FindFirstChild("Overworld") : undefined;
        let clonedMap: Model | undefined;
        if (overworld && overworld.IsA("Model")) {
            clonedMap = overworld.Clone();
            clonedMap.Parent = Workspace;
        } else {
            warn("no map found");
        }

        // Find pads and screens in the cloned map
        let padsRoot: Instance | undefined;
        let screensRoot: Instance | undefined;
        if (clonedMap) {
            padsRoot = clonedMap.WaitForChild("ColorPads", 2);
            screensRoot = clonedMap.FindFirstChild("Screens");
        }
        if (!padsRoot) {
            warn("ColorPads not found in cloned map.");
            if (clonedMap) {
                clonedMap.Destroy();
            }
            return;
        }

        // Initialize active players set
        const activePlayers = new Map<Player, boolean>();
        for (const player of Players.GetPlayers()) {
            if (player.Character && player.Character.FindFirstChild("HumanoidRootPart")) {
                activePlayers.set(player, true);
            }
        }

        // Gameplay loop variables
        let interval = Constants.INITIAL_TARGET_INTERVAL;
        let lastColorName: string | undefined;
        let targetIndex = 1;
        let firstCycle = true;

        // Main round loop
        while (true) {
            // Pick a random target color that is not the same as last round’s color
            let target;
            do {
                target = Constants.COLORS[math.random(0, Constants.COLORS.size() - 1)]; 
            } while (lastColorName && target.Name === lastColorName);
            lastColorName = target.Name;

            // Build list of all pad BaseParts in padsRoot
            const padList = (padsRoot.GetChildren().filter((child): child is BasePart => child.IsA("BasePart")));
            const totalPads = padList.size();

            // Determine how many pads should be the correct color this round
            const fraction = math.max(
                Constants.MIN_TARGET_FRACTION,
                Constants.START_TARGET_FRACTION - (targetIndex - 1) * Constants.FRACTION_DECREASE_PER_ROUND
            );
            const numCorrect = math.max(1, math.floor(totalPads * fraction));

            // Compute distances of each pad to the nearest active player to weight pad selection
            const padDistances = this.computePadDistances(padList, activePlayers);
            let sumDist = 0;
            let countDist = 0;
            padDistances.forEach((d) => {
                if (d < math.huge) {
                    sumDist += d;
                    countDist += 1;
                }
            });
            const averageDistance = countDist > 0 ? sumDist / countDist : 0;
            const maxAllowedDist = averageDistance + 12;

            // Compute weights for pads based on distance (farther pads get slightly higher weight, up to a limit)
            const weights = new Map<BasePart, number>();
            for (const pad of padList) {
                const d = padDistances.get(pad) ?? 0;
                const effective = math.min(d, maxAllowedDist);
                weights.set(pad, effective + 1);
            }

            // Randomly select which pads will be the correct color this round
            const chosenCorrect = this.weightedSample(padList, weights, numCorrect);
            const correctSet = new Set<BasePart>(chosenCorrect);

            // Assign colors to pads: correct pads get the target color, others get a random *different* color
            for (const pad of padList) {
                if (correctSet.has(pad)) {
                    pad.Color = target.Color;
                    pad.SetAttribute("ColorName", target.Name);
                } else {
                    let choice;
                    do {
                        choice = Constants.COLORS[math.random(0, Constants.COLORS.size() - 1)];
                    } while (choice.Name === target.Name);
                    pad.Color = choice.Color;
                    pad.SetAttribute("ColorName", choice.Name);
                }
            }

            // Update any screens/displays in the map to show the target color (if applicable)
            if (screensRoot) {
                for (const descendant of screensRoot.GetDescendants()) {
                    if (descendant.IsA("BasePart")) {
                        descendant.Color = target.Color;
                        descendant.SetAttribute("TargetColorName", target.Name);
                    } else if (descendant.IsA("SurfaceGui")) {
                        for (const child of descendant.GetDescendants()) {
                            if (child.IsA("TextLabel")) {
                                child.Text = target.Name;
                            }
                        }
                    }
                }
            }

            // Teleport all active players onto random pads at the start of the first cycle
            if (firstCycle) {
                task.wait(0.15);
                activePlayers.forEach((_, player) => {
                    const char = player.Character;
                    if (char && char.FindFirstChild("HumanoidRootPart")) {
                        if (padList.size() > 0) {
                            const randomPad = padList[math.random(0, padList.size() - 1)];
                            this.teleportCharacterToPart(char, randomPad);
                        }
                    }
                });
                firstCycle = false;
            }

            // Fire a remote event to all clients with the new target color information
            this.Client.NewTargetColor.FireAll(target);

            // Start countdown timer for this round’s color (interval seconds)
            let t = interval;
            while (t > 0) {
                task.wait(1);
                t -= 1;
            }
            // (After the loop, time is up for players to move)

            // Eliminate players who are NOT on a correct pad
            activePlayers.forEach((_, player) => {
                if (!this.isPlayerOnCorrectPad(player, target, padsRoot!)) {
                    activePlayers.delete(player);
                    const char = player.Character;
                    if (char) {
                        const hrp = char.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
                        if (hrp) {
                            const loserCFrame = this.getLoserSpawnCFrame();
                            if (loserCFrame) {
                                hrp.CFrame = loserCFrame;
                            }
                        }
                    }
                }
            });

            // Check how many players remain active
            let remaining = 0;
            activePlayers.forEach(() => remaining++);
            if (remaining === 0) {
                // All players have been eliminated, end the round
                break;
            }

            // Increase difficulty for next round (decrease interval, increase target index)
            interval = math.max(Constants.MIN_TARGET_INTERVAL, interval - 0.5);
            targetIndex += 1;
        }

        // Round ended: cleanup map and teleport players back to lobby
        if (clonedMap) {
            clonedMap.Destroy();
        }
        const lobbyArea = Workspace.FindFirstChild("LobbyArea");
        let lobbySpawnCFrame: CFrame | undefined;
        if (lobbyArea) {
            const spawnLoc = lobbyArea.FindFirstChildOfClass("SpawnLocation") || lobbyArea.FindFirstChild("SpawnLocation");
            if (spawnLoc && spawnLoc.IsA("BasePart")) {
                lobbySpawnCFrame = spawnLoc.CFrame.add(new Vector3(0, 5, 0));
            } else if (lobbyArea.IsA("BasePart")) {
                lobbySpawnCFrame = lobbyArea.CFrame.add(new Vector3(0, 5, 0));
            } else if (lobbyArea.IsA("Model") && (lobbyArea as Model).GetModelCFrame) {
                lobbySpawnCFrame = new CFrame((lobbyArea as Model).GetModelCFrame().Position.add(new Vector3(0, 5, 0)));
            }
        }
        // Teleport all players (active and eliminated) back to lobby spawn point
        for (const player of Players.GetPlayers()) {
            const char = player.Character;
            if (char) {
                const hrp = char.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
                if (hrp && lobbySpawnCFrame) {
                    hrp.CFrame = lobbySpawnCFrame;
                }
            }
        }
    },

    // Main game loop: handles the intermission countdown and continuously starts new rounds.
    KnitStart() {
        while (true) {
            // Lobby phase
            this.Client.UpdatePhase.FireAll("Lobby");
            let countdown = Constants.INTERMISSION_DURATION;
            while (countdown > 0) {
                this.Client.UpdateCountdown.FireAll(countdown);
                task.wait(1);
                countdown -= 1;
            }
            this.Client.UpdateCountdown.FireAll(0);

            // Start a new round
            this.StartRound();

            // Short delay before next intermission
            task.wait(2);
        }
    },
});

export = GameService;
