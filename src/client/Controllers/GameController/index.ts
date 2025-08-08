import { KnitClient as Knit } from "@rbxts/knit";
import { Players, ReplicatedStorage, Workspace } from "@rbxts/services";
import Roact from "@rbxts/roact";

type GameServiceClient = {
	UpdatePhase: RBXScriptSignal<(phase: string) => void>;
	UpdateCountdown: RBXScriptSignal<(seconds: number) => void>;
	NewTargetColor: RBXScriptSignal<(target: { Name: string; Color: Color3 }) => void>;
};

const player = Players.LocalPlayer!;
const playerGui = player.WaitForChild("PlayerGui") as PlayerGui;

import Constants from "shared/Modules/Constants";

interface CountdownProps {
	countdown?: string;
	targetColorName?: string;
	targetColor?: Color3;
	phase?: string;
}

class CountdownUI extends Roact.Component<CountdownProps> {
	render(): Roact.Element {
		const countdown = this.props.countdown ?? `${Constants.INTERMISSION_DURATION}`;
		const targetColorName = this.props.targetColorName ?? "";
		const targetColor = this.props.targetColor ?? Color3.fromRGB(255, 255, 255);
		const phase = this.props.phase ?? "Lobby";

		const children: Record<string, Roact.Element> = {};
		if (phase === "Lobby") {
			children["Label"] = Roact.createElement("TextLabel", {
				Size: UDim2.fromScale(1, 1),
				BackgroundTransparency: 1,
				Text: "Round will start in: " + countdown,
				TextScaled: true,
				Font: Enum.Font.GothamBold,
				TextColor3: Color3.fromRGB(255, 255, 255),
			});
		} else if (phase === "Round") {
			children["Title"] = Roact.createElement("TextLabel", {
				Size: new UDim2(1, 0, 0.45, 0),
				Position: new UDim2(0, 0, 0, 0),
				BackgroundTransparency: 1,
				Text: "Stand on: " + (targetColorName !== "" ? targetColorName : "..."),
				TextScaled: true,
				Font: Enum.Font.GothamBold,
				TextColor3: Color3.fromRGB(255, 255, 255),
			});
			children["Swatch"] = Roact.createElement(
				"Frame",
				{
					Size: new UDim2(1, 0, 0.55, 0),
					Position: new UDim2(0, 0, 0.45, 0),
					BackgroundColor3: targetColor,
					BorderSizePixel: 0,
				},
				{
					NameLabel: Roact.createElement("TextLabel", {
						AnchorPoint: new Vector2(0.5, 0.5),
						Position: UDim2.fromScale(0.5, 0.5),
						Size: UDim2.fromScale(0.8, 0.6),
						BackgroundTransparency: 1,
						Text: targetColorName,
						TextScaled: true,
						Font: Enum.Font.GothamBold,
						TextColor3: new Color3(1, 1, 1),
					}),
				},
			);
		} else {
			children["Label"] = Roact.createElement("TextLabel", {
				Size: UDim2.fromScale(1, 1),
				BackgroundTransparency: 1,
				Text: "Waiting...",
				TextScaled: true,
				Font: Enum.Font.GothamBold,
				TextColor3: Color3.fromRGB(255, 255, 255),
			});
		}

		return Roact.createElement(
			"ScreenGui",
			{ ResetOnSpawn: false, Name: "ColorMatchUI" },
			{
				Frame: Roact.createElement(
					"Frame",
					{
						AnchorPoint: new Vector2(0.5, 0),
						Position: new UDim2(0.5, 0, 0, 12),
						Size: new UDim2(0, 300, 0, 75),
						BackgroundTransparency: 1,
					},
					children,
				),
			},
		);
	}
}

const uiElement = Roact.createElement(CountdownUI, {
	countdown: `${Constants.INTERMISSION_DURATION}`,
	targetColorName: "",
	targetColor: Color3.fromRGB(255, 255, 255),
	phase: "Lobby",
});
let handle = Roact.mount(uiElement, playerGui, "ColorMatchUI");

const playSoundFromStorage = (name: string, loop?: boolean) => {
	const soundsFolder = ReplicatedStorage.FindFirstChild("Sounds") as Folder | undefined;
	const template = soundsFolder?.FindFirstChild(name) as Sound | undefined;
	if (!template || !template.IsA("Sound")) return undefined;
	const copy = template.Clone();
	copy.Looped = loop ?? false;
	copy.Parent = Workspace;
	copy.Play();
	return copy;
};

let lobbyAmbience: Sound | undefined;
let roundAmbience: Sound | undefined;
let loserAmbience: Sound | undefined;
let countdownBeep: Sound | undefined;

const updateUI = (newState: CountdownProps) => {
	handle = Roact.update(handle, Roact.createElement(CountdownUI, newState));
};

const GameController = Knit.CreateController({
	Name: "GameController",

	KnitStart() {
		const gameService = (Knit as unknown as { GetService(name: string): unknown }).GetService(
			"GameService",
		) as GameServiceClient;

		if (gameService.UpdatePhase) {
			gameService.UpdatePhase.Connect((phase: string) => {
				if (phase === "Lobby") {
					updateUI({
						countdown: `${Constants.INTERMISSION_DURATION}`,
						phase: "Lobby",
						targetColorName: "",
						targetColor: Color3.fromRGB(255, 255, 255),
					});
					if (roundAmbience) {
						roundAmbience.Stop();
						roundAmbience.Destroy();
						roundAmbience = undefined;
					}
					if (loserAmbience) {
						loserAmbience.Stop();
						loserAmbience.Destroy();
						loserAmbience = undefined;
					}
					if (!lobbyAmbience) {
						lobbyAmbience = playSoundFromStorage("Ambience2", true);
					}
				} else if (phase === "Round") {
					updateUI({ phase: "Round" });
					if (lobbyAmbience) {
						lobbyAmbience.Stop();
						lobbyAmbience.Destroy();
						lobbyAmbience = undefined;
					}
					if (loserAmbience) {
						loserAmbience.Stop();
						loserAmbience.Destroy();
						loserAmbience = undefined;
					}
					if (!roundAmbience) {
						roundAmbience = playSoundFromStorage("Ambience1", true);
					}
				}
			});
		} else {
			warn("gameService.UpdatePhase is nil on client.");
		}

		if (gameService.UpdateCountdown) {
			gameService.UpdateCountdown.Connect((seconds: number) => {
				updateUI({
					countdown: `${seconds}`,
					phase: "Lobby",
					targetColorName: "",
					targetColor: Color3.fromRGB(255, 255, 255),
				});
				if (countdownBeep) {
					countdownBeep.Stop();
					countdownBeep.Destroy();
				}
				countdownBeep = playSoundFromStorage("Countdown", false);
			});
		} else {
			warn("gameService.UpdateCountdown is nil on client.");
		}

		if (gameService.NewTargetColor) {
			gameService.NewTargetColor.Connect((target: { Name: string; Color: Color3 }) => {
				updateUI({
					targetColorName: target.Name,
					phase: "Round",
					targetColor: target.Color,
				});
				playSoundFromStorage("Status", false);
			});
		} else {
			warn("gameService.NewTargetColor is nil on client.");
		}

		task.spawn(() => {
			while (true) {
				task.wait(0.5);
				const char = player.Character;
				const hrp = char && (char.FindFirstChild("HumanoidRootPart") as BasePart | undefined);
				if (hrp) {
					const loserArea =
						(Workspace.FindFirstChild("LooserArea") || Workspace.FindFirstChild("LoserArea")) as
							| BasePart
							| Model
							| undefined;
					if (loserArea) {
						let regionCenter: Vector3;
						if (loserArea.IsA("BasePart")) {
							regionCenter = loserArea.Position;
						} else if (loserArea.IsA("Model") && typeIs((loserArea as Model).GetModelCFrame, "function")) {
							const model = loserArea as Model;
							regionCenter = model.GetModelCFrame().Position;
						} else {
							regionCenter = new Vector3();
						}
						const distance = hrp.Position.sub(regionCenter).Magnitude;
						if (distance < 50) {
							if (!loserAmbience) {
								if (lobbyAmbience) {
									lobbyAmbience.Stop();
									lobbyAmbience.Destroy();
									lobbyAmbience = undefined;
								}
								if (roundAmbience) {
									roundAmbience.Stop();
									roundAmbience.Destroy();
									roundAmbience = undefined;
								}
								loserAmbience = playSoundFromStorage("Ambience2", true);
							}
						} else {
							if (loserAmbience) {
								loserAmbience.Stop();
								loserAmbience.Destroy();
								loserAmbience = undefined;
							}
						}
					}
				}
			}
		});
	},
});

export = GameController;
