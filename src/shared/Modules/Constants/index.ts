const Constants = {} as {
	COLORS: { Name: string; Color: Color3 }[];
	INITIAL_TARGET_INTERVAL: number;
	MIN_TARGET_INTERVAL: number;
	INTERMISSION_DURATION: number;
	START_TARGET_FRACTION: number;
	FRACTION_DECREASE_PER_ROUND: number;
	MIN_TARGET_FRACTION: number;
};

Constants.COLORS = [
	{ Name: "Red", Color: Color3.fromRGB(255, 0, 0) },
	{ Name: "Yellow", Color: Color3.fromRGB(255, 255, 0) },
	{ Name: "Green", Color: Color3.fromRGB(0, 255, 0) },
	{ Name: "Blue", Color: Color3.fromRGB(0, 0, 255) },
	{ Name: "Purple", Color: Color3.fromRGB(128, 0, 128) },
];

Constants.INITIAL_TARGET_INTERVAL = 5;
Constants.MIN_TARGET_INTERVAL = 2;
Constants.INTERMISSION_DURATION = 10;

Constants.START_TARGET_FRACTION = 0.3;
Constants.FRACTION_DECREASE_PER_ROUND = 0.05;
Constants.MIN_TARGET_FRACTION = 0.1;

export default Constants;

export type ClientGameService = {
	UpdatePhase: RBXScriptSignal<(phase: string) => void>;
	UpdateCountdown: RBXScriptSignal<(seconds: number) => void>;
	NewTargetColor: RBXScriptSignal<(target: { Name: string; Color: Color3 }) => void>;
};

declare global {
	interface KnitServices {
		GameService: ClientGameService;
	}
}
export {};