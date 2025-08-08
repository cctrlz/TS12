import { KnitClient as Knit } from "@rbxts/knit";

Knit.AddControllers(script.Parent!.FindFirstChild("Controllers")!);
Knit.Start().andThen(() => {
    print("Client Started");
}).catch(warn);