//[[ DOCUMENTATION | dnshijacking 7/28/2025 
//StartRound() | Return NIL
//-Executes a full round cycle: selects a non-repeating target color, assigns pad colors with decreasing correct fraction, teleports players, tracks eliminations, updates screens, and handles cleanup.
//
//KnitStart() | Return NIL
//-Main game loop: handles intermission countdowns, fires lobby/round phase signals, and triggers rounds continuously.
//
//isPlayerOnCorrectPad(player, targetColor, padsRoot) | Return BOOL
//-Determines whether the given player is standing on a pad matching the current target color.
//
//getLoserSpawnCFrame() | Return CFrame or nil
//-Retrieves the teleport destination for eliminated players in the loser area.
//
//teleportCharacterToPart(character, part) | Return NIL
//-Moves the given character to the specified pad.
//
//computePadDistances(pads, activePlayers) | Return TABLE
//-Computes the closest distance from each pad to any active player.
//
//weightedSample(padList, weights, count) | Return ARRAY
//-Selects count, unique pads from padList preferring higher weights.
//]]

import { KnitServer as Knit, RemoteSignal } from "@rbxts/knit";
import { Players, ServerStorage, Workspace } from "@rbxts/services";
import Constants from "shared/Modules/Constants";

type ColorDef = { Name: string; Color: Color3 };

interface GameServiceI {
	Name: "GameService";
	Client: {
		UpdateCountdown: RemoteSignal<(n: number) => void>;
		NewTargetColor: RemoteSignal<(t: ColorDef) => void>;
		UpdatePhase: RemoteSignal<(phase: string) => void>;
	};
	StartRound(): void;
	KnitStart(): void;
}

const GameService = Knit.CreateService({
	Name: "GameService",
	Client: {
		UpdateCountdown: new RemoteSignal<(n: number) => void>(),
		NewTargetColor: new RemoteSignal<(t: ColorDef) => void>(),
		UpdatePhase: new RemoteSignal<(phase: string) => void>(),
	},

	StartRound(this: GameServiceI) {
		this.Client.UpdatePhase.FireAll("Round");

		const mapsFolder = ServerStorage.FindFirstChild("Maps") as Folder | undefined;
		const overworld = mapsFolder?.FindFirstChild("Overworld") as Instance | undefined;

		let clonedMap: Instance | undefined;
		if (overworld) {
			clonedMap = overworld.Clone();
			clonedMap.Parent = Workspace;
		} else {
			warn("no map found");
		}

		let padsRoot: Instance | undefined;
		let screensRoot: Instance | undefined;
		if (clonedMap) {
			padsRoot = clonedMap.FindFirstChild("ColorPads") || clonedMap.WaitForChild("ColorPads", 2);
			screensRoot = clonedMap.FindFirstChild("Screens");
		}

		if (!padsRoot) {
			warn("ColorPads not found in cloned map.");
			clonedMap?.Destroy();
			return;
		}

		const activePlayers = new Set<Player>();
		for (const player of Players.GetPlayers()) {
			const char = player.Character;
			if (char && char.FindFirstChild("HumanoidRootPart")) activePlayers.add(player);
		}

		const teleportCharacterToPart = (character: Model, part: BasePart | Attachment) => {
			if (!(character && part)) return;
			const hrp = character.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
			if (!hrp) return;
			const host = (part.IsA("BasePart") ? part : part.Parent) as BasePart | undefined;
			const attachment =
				(host && (host.FindFirstChild("TeleportLocation") as Attachment | undefined)) ||
				(host && host.FindFirstChildWhichIsA("Attachment"));
			if (attachment && attachment.IsA("Attachment")) {
				hrp.CFrame = new CFrame(attachment.WorldPosition);
			} else if (host) {
				hrp.CFrame = host.CFrame.add(new Vector3(0, 5, 0));
			}
		};

		const getLoserSpawnCFrame = (): CFrame | undefined => {
			const loserArea = (Workspace.FindFirstChild("LooserArea") ||
				Workspace.FindFirstChild("LoserArea")) as Instance | undefined;
			if (!loserArea) return undefined;
			const loserPad = (loserArea.FindFirstChild("LooserPad") ||
				loserArea.FindFirstChild("LoserPad")) as BasePart | undefined;
			if (!loserPad) return undefined;
			const att = loserPad.FindFirstChild("TeleportLocation") as Attachment | undefined;
			if (att && att.IsA("Attachment")) return new CFrame(att.WorldPosition);
			return loserPad.CFrame.add(new Vector3(0, 5, 0));
		};

		const isPlayerOnCorrectPad = (player: Player, targetColor: ColorDef, root: Instance) => {
			const char = player.Character;
			if (!char) return false;
			const hrp = char.FindFirstChild("HumanoidRootPart") as BasePart | undefined;
			if (!hrp) return false;

			const params = new RaycastParams();
			params.FilterDescendantsInstances = [char];
			params.FilterType = Enum.RaycastFilterType.Exclude;

			const result = Workspace.Raycast(hrp.Position, new Vector3(0, -10, 0), params);
			if (result && result.Instance && result.Instance.IsA("BasePart")) {
				const part = result.Instance;
				if (part.IsDescendantOf(root)) {
					if (part.Color === targetColor.Color) return true;
				}
			}
			return false;
		};

		const computePadDistances = (pads: BasePart[], players: Set<Player>) => {
			const distances = new Map<BasePart, number>();
			for (const pad of pads) {
				let closest = math.huge;
				const padPos = pad.Position;
				for (const player of players) {
					const char = player.Character;
					const hrp = char && (char.FindFirstChild("HumanoidRootPart") as BasePart | undefined);
					if (hrp) {
						const d = hrp.Position.sub(padPos).Magnitude;
						if (d < closest) closest = d;
					}
				}
				distances.set(pad, closest);
			}
			return distances;
		};

		const weightedSample = (padList: BasePart[], weights: Map<BasePart, number>, count: number) => {
			const result = new Array<BasePart>();
			const pool = [...padList];

			for (let i = 0; i < count; i++) {
				if (pool.size() === 0) break;
				let totalWeight = 0;
				for (const pad of pool) totalWeight += weights.get(pad) ?? 0;

				if (totalWeight <= 0) {
					result.push(pool.shift()!);
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
					result.push(pool[chosenIndex]);
					pool.remove(chosenIndex);
				}
			}
			return result;
		};

		let interval = Constants.INITIAL_TARGET_INTERVAL;
		let lastColorName: string | undefined;
		let targetIndex = 1;
		let firstCycle = true;

		while (true) {
			let target: ColorDef;
			do {
				target = Constants.COLORS[math.random(1, Constants.COLORS.size()) - 1];
			} while (lastColorName !== undefined && target.Name === lastColorName);
			lastColorName = target.Name;

			const padList = new Array<BasePart>();
			for (const child of (padsRoot as Instance).GetChildren()) if (child.IsA("BasePart")) padList.push(child);
			const totalPads = padList.size();

			const fraction = math.max(
				Constants.MIN_TARGET_FRACTION,
				Constants.START_TARGET_FRACTION - (targetIndex - 1) * Constants.FRACTION_DECREASE_PER_ROUND,
			);
			const numCorrect = math.max(1, math.floor(totalPads * fraction));

			const padDistances = computePadDistances(padList, activePlayers);
			let sumDist = 0;
			let countDist = 0;
			for (const [, d] of padDistances) {
				if (d < math.huge) {
					sumDist += d;
					countDist += 1;
				}
			}
			const averageDistance = countDist > 0 ? sumDist / countDist : 0;
			const maxAllowedDist = averageDistance + 12;

			const weights = new Map<BasePart, number>();
			for (const pad of padList) {
				const d = padDistances.get(pad) ?? 0;
				const effective = math.min(d, maxAllowedDist);
				weights.set(pad, effective + 1);
			}

			const chosenCorrect = weightedSample(padList, weights, numCorrect);
			const correctSet = new Set<BasePart>(chosenCorrect);

			for (const pad of padList) {
				if (correctSet.has(pad)) {
					pad.Color = target.Color;
					pad.SetAttribute("ColorName", target.Name);
				} else {
					let choice: ColorDef;
					do {
						choice = Constants.COLORS[math.random(1, Constants.COLORS.size()) - 1];
					} while (choice.Name === target.Name);
					pad.Color = choice.Color;
					pad.SetAttribute("ColorName", choice.Name);
				}
			}

			if (screensRoot) {
				for (const descendant of screensRoot.GetDescendants()) {
					if (descendant.IsA("BasePart")) {
						descendant.Color = target.Color;
						descendant.SetAttribute("TargetColorName", target.Name);
					} else if (descendant.IsA("SurfaceGui")) {
						for (const child of descendant.GetDescendants()) {
							if (child.IsA("TextLabel")) child.Text = target.Name;
						}
					}
				}
			}

			if (firstCycle) {
				task.wait(0.15);
				for (const player of activePlayers) {
					const char = player.Character;
					const hrp = char && (char.FindFirstChild("HumanoidRootPart") as BasePart | undefined);
					if (hrp && padList.size() > 0) {
						const pad = padList[math.random(1, padList.size()) - 1];
						teleportCharacterToPart(char!, pad);
					}
				}
				firstCycle = false;
			}

			this.Client.NewTargetColor.FireAll(target);

			let t = interval;
			while (t > 0) {
				task.wait(1);
				t -= 1;
			}

			const toCheck = new Array<Player>();
			for (const p of activePlayers) toCheck.push(p);

			for (const player of toCheck) {
				if (!isPlayerOnCorrectPad(player, target, padsRoot)) {
					activePlayers.delete(player);
					const char = player.Character;
					const hrp = char && (char.FindFirstChild("HumanoidRootPart") as BasePart | undefined);
					if (hrp) {
						const loserCFrame = getLoserSpawnCFrame();
						if (loserCFrame) hrp.CFrame = loserCFrame;
					}
				}
			}

			let remaining = 0;
			for (const _ of activePlayers) remaining += 1;
			if (remaining === 0) break;

			interval = math.max(Constants.MIN_TARGET_INTERVAL, interval - 0.5);
			targetIndex += 1;
		}

		clonedMap?.Destroy();

		const lobbyArea = Workspace.FindFirstChild("LobbyArea") as Instance | undefined;
		let lobbySpawnCFrame: CFrame | undefined;
		if (lobbyArea) {
			const spawnLoc =
				(lobbyArea.FindFirstChildOfClass("SpawnLocation") as BasePart | undefined) ||
				(lobbyArea.FindFirstChild("SpawnLocation") as BasePart | undefined);
			if (spawnLoc) {
				lobbySpawnCFrame = spawnLoc.CFrame.add(new Vector3(0, 5, 0));
			} else if (lobbyArea.IsA("BasePart")) {
				lobbySpawnCFrame = lobbyArea.CFrame.add(new Vector3(0, 5, 0));
			} else if (lobbyArea.IsA("Model") && typeIs((lobbyArea as Model).GetModelCFrame, "function")) {
				const model = lobbyArea as Model;
				lobbySpawnCFrame = new CFrame(model.GetModelCFrame().Position.add(new Vector3(0, 5, 0)));
			}
		}

		for (const player of Players.GetPlayers()) {
			const char = player.Character;
			const hrp = char && (char.FindFirstChild("HumanoidRootPart") as BasePart | undefined);
			if (hrp && lobbySpawnCFrame) hrp.CFrame = lobbySpawnCFrame;
		}
	},

	KnitStart(this: GameServiceI) {
		while (true) {
			this.Client.UpdatePhase.FireAll("Lobby");
			let countdown = Constants.INTERMISSION_DURATION;
			while (countdown > 0) {
				this.Client.UpdateCountdown.FireAll(countdown);
				task.wait(1);
				countdown -= 1;
			}
			this.Client.UpdateCountdown.FireAll(0);

			this.StartRound();

			task.wait(2);
		}
	},
}) as GameServiceI;

export = GameService;
