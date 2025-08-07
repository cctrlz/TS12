import { KnitServer as Knit } from "@rbxts/knit";

Knit.AddServices(script.Parent?.FindFirstChild("Services") as Instance);  
Knit.Start().then(() => {
    print("Server Started");
});
