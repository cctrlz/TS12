const Constants = {
    COLORS: [
        { Name: "Red",    Color: Color3.fromRGB(255, 0, 0) },
        { Name: "Yellow", Color: Color3.fromRGB(255, 255, 0) },
        { Name: "Green",  Color: Color3.fromRGB(0, 255, 0) },
        { Name: "Blue",   Color: Color3.fromRGB(0, 0, 255) },
        { Name: "Purple", Color: Color3.fromRGB(128, 0, 128) },
    ] as const,

    INITIAL_TARGET_INTERVAL: 5,      // seconds
    MIN_TARGET_INTERVAL: 2,
    INTERMISSION_DURATION: 10,      // lobby countdown duration in seconds

    START_TARGET_FRACTION: 0.3,      // initial fraction of pads that are the correct color
    FRACTION_DECREASE_PER_ROUND: 0.05, // how much the fraction shrinks each new target
    MIN_TARGET_FRACTION: 0.1,        // floor fraction so there's always at least some correct pads
};

export = Constants;
