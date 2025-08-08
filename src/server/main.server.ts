import { KnitServer as Knit } from "@rbxts/knit";
 
Knit.AddServices(script.Parent!.FindFirstChild("Services")!);
Knit.Start().andThen(() => {
    print("Server Started");
});
   